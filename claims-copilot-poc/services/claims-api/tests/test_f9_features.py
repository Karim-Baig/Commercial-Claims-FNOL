"""
F9 — dashboard personalisation, in-context adjuster messaging, cross-device drafts.

The security-relevant assertions here are the ones that matter most: messaging and
drafts both introduce new ways to reach claim data, so each has to re-prove BR-001
scope isolation rather than inherit it by assumption.
"""
import pytest

from conftest import auth


# ── helpers ───────────────────────────────────────────────────────────────────


def _first_claim_with_thread(client, token):
    """Finds a claim in the caller's scope whose thread has at least one message."""
    items = client.get("/api/v1/claims", headers=auth(token)).json()["items"]
    for c in items:
        r = client.get(f"/api/v1/claims/{c['aon_claim_id']}/messages", headers=auth(token))
        if r.status_code == 200 and r.json()["items"]:
            return c["aon_claim_id"], r.json()
    return None, None


# ── Dashboard personalisation ─────────────────────────────────────────────────


def test_preferences_default_when_never_saved(client, tokens):
    """
    A user who has never personalised sees exactly the original five tiles.

    The additional KPIs are offered in the customiser but must arrive hidden - a
    dashboard that opens with every available tile is not a dashboard.
    """
    from app.routers.preference_routes import DEFAULT_VISIBLE_KPIS

    r = client.get("/api/v1/preferences", headers=auth(tokens[1]))
    assert r.status_code == 200
    body = r.json()
    assert body["is_default"] is True
    assert body["kpi_order"] == body["known_kpis"]

    visible = [key for key in body["kpi_order"] if key not in body["kpi_hidden"]]
    assert visible == DEFAULT_VISIBLE_KPIS
    assert len(visible) == 5
    # There must actually be extra tiles to choose from, or this feature is moot.
    assert len(body["known_kpis"]) > len(visible)


def test_every_known_kpi_is_returned_by_summary(client, tokens):
    """
    The customiser offers KNOWN_KPIS, so the summary must supply every one of them.
    A key offered but not returned would render as a blank tile.
    """
    from app.routers.preference_routes import KNOWN_KPIS

    kpis = client.get("/api/v1/summary", headers=auth(tokens[1])).json()["kpis"]
    missing = [key for key in KNOWN_KPIS if key not in kpis]
    assert not missing, f"offered in the customiser but absent from /summary: {missing}"


def test_every_known_kpi_has_a_translation(client, tokens):
    """
    Tile labels resolve through `kpi.<key>`, so a new KPI without a translation
    would surface its raw key to the user.
    """
    import json
    from pathlib import Path

    from app.routers.preference_routes import KNOWN_KPIS

    bundle = (
        Path(__file__).resolve().parents[3]
        / "packages" / "i18n" / "locales" / "en-US.json"
    )
    if not bundle.exists():
        pytest.skip("locale bundle not reachable from the test tree")

    strings = json.loads(bundle.read_text(encoding="utf-8"))
    missing = [key for key in KNOWN_KPIS if f"kpi.{key}" not in strings]
    assert not missing, f"KPIs with no kpi.<key> translation: {missing}"


def test_summary_kpis_declare_unit_and_direction(client, tokens):
    """
    The dashboard renders tiles it has no specific knowledge of, so each KPI must
    describe how to format itself and which direction is bad news.
    """
    kpis = client.get("/api/v1/summary", headers=auth(tokens[1])).json()["kpis"]
    for key, value in kpis.items():
        assert value["unit"] in {"money", "count", "percent", "days"}, (
            f"{key} carries an unrenderable unit: {value.get('unit')}"
        )
        assert isinstance(value["rise_is_adverse"], bool), f"{key} has no direction"

    # Spot-check the units that are easy to get wrong.
    assert kpis["open_claims"]["unit"] == "count"
    assert kpis["closure_rate"]["unit"] == "percent"
    assert kpis["avg_days_to_close"]["unit"] == "days"
    assert kpis["total_gross_incurred"]["unit"] == "money"


def test_summary_counts_reconcile_with_claim_count(client, tokens):
    """Open + closed must account for every claim in scope."""
    body = client.get("/api/v1/summary", headers=auth(tokens[1])).json()
    kpis = body["kpis"]
    assert kpis["total_claims"]["value"] == body["claim_count"]
    assert (
        kpis["open_claims"]["value"] + kpis["closed_claims"]["value"]
        == body["claim_count"]
    )


def test_summary_percentages_are_in_range(client, tokens):
    kpis = client.get("/api/v1/summary", headers=auth(tokens[1])).json()["kpis"]
    for key in ("reserve_ratio", "closure_rate"):
        assert 0 <= kpis[key]["value"] <= 100, f"{key} out of range: {kpis[key]['value']}"


def test_new_tile_does_not_switch_itself_on_for_existing_users(client, tokens):
    """
    Someone who saved a layout before a tile shipped must not have it appear
    unannounced. A stored preference that predates a KPI gets it appended to the
    order but left hidden.
    """
    # Simulate a preference saved when only the original five existed.
    legacy = {
        "kpi_order": [
            "total_gross_incurred", "avg_gross_incurred", "total_outstanding",
            "total_paid", "largest_claim",
        ],
        "kpi_hidden": [],
    }
    assert client.put("/api/v1/preferences", json=legacy, headers=auth(tokens[6])).status_code == 200

    got = client.get("/api/v1/preferences", headers=auth(tokens[6])).json()
    visible = [key for key in got["kpi_order"] if key not in got["kpi_hidden"]]
    assert visible == legacy["kpi_order"], (
        f"a newly shipped tile appeared without being asked for: "
        f"{set(visible) - set(legacy['kpi_order'])}"
    )
    # The new tiles are still reachable in the customiser.
    assert set(got["kpi_order"]) == set(got["known_kpis"])


def test_preferences_can_opt_into_a_new_tile(client, tokens):
    """An added tile becomes visible once explicitly chosen."""
    payload = {
        "kpi_order": ["open_claims", "closure_rate", "total_gross_incurred"],
        "kpi_hidden": ["total_gross_incurred"],
    }
    assert client.put("/api/v1/preferences", json=payload, headers=auth(tokens[5])).status_code == 200

    got = client.get("/api/v1/preferences", headers=auth(tokens[5])).json()
    visible = [key for key in got["kpi_order"] if key not in got["kpi_hidden"]]
    assert visible[:2] == ["open_claims", "closure_rate"]
    assert "total_gross_incurred" not in visible


def test_preferences_round_trip(client, tokens):
    """A saved layout is returned on the next read."""
    payload = {
        "kpi_order": ["total_paid", "largest_claim", "total_gross_incurred",
                      "avg_gross_incurred", "total_outstanding"],
        "kpi_hidden": ["avg_gross_incurred"],
    }
    put = client.put("/api/v1/preferences", json=payload, headers=auth(tokens[3]))
    assert put.status_code == 200

    got = client.get("/api/v1/preferences", headers=auth(tokens[3])).json()
    assert got["kpi_order"][0] == "total_paid"
    # The explicitly hidden tile is honoured; tiles the payload never mentioned are
    # appended as hidden, so test membership rather than the exact list.
    assert "avg_gross_incurred" in got["kpi_hidden"]
    visible = [k for k in got["kpi_order"] if k not in got["kpi_hidden"]]
    assert visible == ["total_paid", "largest_claim", "total_gross_incurred",
                       "total_outstanding"]
    assert got["is_default"] is False


def test_preferences_are_per_user_not_global(client, tokens):
    """Persona 3's saved layout must not leak into Persona 5's dashboard."""
    # Start Persona 5 from a known state so this does not depend on test order.
    client.delete("/api/v1/preferences", headers=auth(tokens[5]))

    client.put(
        "/api/v1/preferences",
        json={"kpi_order": ["largest_claim"], "kpi_hidden": ["total_paid"]},
        headers=auth(tokens[3]),
    )

    other = client.get("/api/v1/preferences", headers=auth(tokens[5])).json()
    assert other["is_default"] is True, "preferences bled across users"
    assert "total_paid" not in other["kpi_hidden"], "another user's hidden tile leaked"


def test_preferences_reject_unknown_kpi(client, tokens):
    r = client.put(
        "/api/v1/preferences",
        json={"kpi_order": ["not_a_real_kpi"], "kpi_hidden": []},
        headers=auth(tokens[1]),
    )
    assert r.status_code == 422


def test_preferences_reject_hiding_every_tile(client, tokens):
    """An entirely empty dashboard has no affordance left to undo it."""
    known = client.get("/api/v1/preferences", headers=auth(tokens[1])).json()["known_kpis"]
    r = client.put(
        "/api/v1/preferences",
        json={"kpi_order": known, "kpi_hidden": known},
        headers=auth(tokens[1]),
    )
    assert r.status_code == 422


def test_preferences_normalise_drops_stale_and_appends_new(client, tokens):
    """A partial order is completed with the remaining known tiles."""
    client.put(
        "/api/v1/preferences",
        json={"kpi_order": ["total_paid"], "kpi_hidden": []},
        headers=auth(tokens[4]),
    )
    got = client.get("/api/v1/preferences", headers=auth(tokens[4])).json()
    assert got["kpi_order"][0] == "total_paid"
    assert sorted(got["kpi_order"]) == sorted(got["known_kpis"]), (
        "every known KPI should survive normalisation"
    )


def test_preferences_reset_restores_default(client, tokens):
    client.put(
        "/api/v1/preferences",
        json={"kpi_order": ["total_paid"], "kpi_hidden": ["total_paid"]},
        headers=auth(tokens[2]),
    )
    r = client.delete("/api/v1/preferences", headers=auth(tokens[2]))
    assert r.status_code == 200
    assert client.get("/api/v1/preferences", headers=auth(tokens[2])).json()["is_default"] is True


def test_preferences_require_auth(client):
    assert client.get("/api/v1/preferences").status_code == 401


# ── In-context adjuster messaging ─────────────────────────────────────────────


def test_messages_thread_returns_seeded_conversation(client, tokens):
    claim_id, thread = _first_claim_with_thread(client, tokens[1])
    if not claim_id:
        pytest.skip("no seeded message thread in Persona 1 scope")
    assert len(thread["items"]) >= 1
    roles = {m["author_role"] for m in thread["items"]}
    assert roles, "thread carried no author roles"


def test_messages_internal_notes_are_withheld_server_side(client, tokens):
    """
    Aon-internal notes share the table with client correspondence and must never
    reach the browser. The withheld count proves rows were filtered, not hidden.
    """
    claim_id, thread = _first_claim_with_thread(client, tokens[1])
    if not claim_id:
        pytest.skip("no seeded message thread in Persona 1 scope")

    assert thread["withheld"] >= 1, "expected at least one internal note to be withheld"
    for m in thread["items"]:
        assert "INTERNAL" not in m["body"].upper(), (
            f"an internal note leaked into the client thread: {m['body'][:60]}"
        )
        # Internal bookkeeping must not be serialised to a client surface.
        assert "audience" not in m
        assert "author_sub" not in m


def test_messages_out_of_scope_claim_returns_403(client, tokens):
    """BR-001: a thread on an out-of-scope claim is 403, never 404."""
    corp = client.get("/api/v1/claims", headers=auth(tokens[1])).json()["items"]
    out_of_scope = next((c for c in corp if c["org_node"] != "SITE-JFK-T4-BISTRO"), None)
    if not out_of_scope:
        pytest.skip("no out-of-scope claim available")

    r = client.get(
        f"/api/v1/claims/{out_of_scope['aon_claim_id']}/messages",
        headers=auth(tokens[5]),
    )
    assert r.status_code == 403


def test_messages_post_then_appears_in_thread(client, tokens):
    items = client.get("/api/v1/claims", headers=auth(tokens[5])).json()["items"]
    if not items:
        pytest.skip("Persona 5 has no claims in scope")
    claim_id = items[0]["aon_claim_id"]

    before = client.get(f"/api/v1/claims/{claim_id}/messages", headers=auth(tokens[5])).json()
    post = client.post(
        f"/api/v1/claims/{claim_id}/messages",
        json={"body": "Sending the invoice across this afternoon."},
        headers=auth(tokens[5]),
    )
    assert post.status_code == 201
    assert post.json()["author_role"] == "client"
    assert post.json()["is_own"] is True

    after = client.get(f"/api/v1/claims/{claim_id}/messages", headers=auth(tokens[5])).json()
    assert len(after["items"]) == len(before["items"]) + 1
    assert after["items"][-1]["body"] == "Sending the invoice across this afternoon."
    assert after["items"][-1]["is_own"] is True


def test_messages_cannot_post_to_out_of_scope_claim(client, tokens):
    corp = client.get("/api/v1/claims", headers=auth(tokens[1])).json()["items"]
    out_of_scope = next((c for c in corp if c["org_node"] != "SITE-JFK-T4-BISTRO"), None)
    if not out_of_scope:
        pytest.skip("no out-of-scope claim available")

    r = client.post(
        f"/api/v1/claims/{out_of_scope['aon_claim_id']}/messages",
        json={"body": "should never be written"},
        headers=auth(tokens[5]),
    )
    assert r.status_code == 403


def test_messages_client_cannot_forge_an_aon_reply(client, tokens):
    """
    author_role is derived from the caller, not the payload. A client posting extra
    fields must still be recorded as a client message.
    """
    items = client.get("/api/v1/claims", headers=auth(tokens[5])).json()["items"]
    if not items:
        pytest.skip("Persona 5 has no claims in scope")
    claim_id = items[0]["aon_claim_id"]

    r = client.post(
        f"/api/v1/claims/{claim_id}/messages",
        json={
            "body": "Attempting to impersonate the adjuster.",
            "author_role": "aon",
            "audience": "internal",
            "author_name": "Sarah Chen",
        },
        headers=auth(tokens[5]),
    )
    assert r.status_code == 201
    assert r.json()["author_role"] == "client", "client managed to author an Aon reply"

    # It must also remain visible, i.e. the client could not hide it from Aon.
    thread = client.get(f"/api/v1/claims/{claim_id}/messages", headers=auth(tokens[5])).json()
    assert any(m["body"] == "Attempting to impersonate the adjuster." for m in thread["items"])


def test_messages_reject_empty_body(client, tokens):
    items = client.get("/api/v1/claims", headers=auth(tokens[5])).json()["items"]
    if not items:
        pytest.skip("Persona 5 has no claims in scope")
    r = client.post(
        f"/api/v1/claims/{items[0]['aon_claim_id']}/messages",
        json={"body": "   "},
        headers=auth(tokens[5]),
    )
    assert r.status_code == 422


def test_messages_require_auth(client, tokens):
    items = client.get("/api/v1/claims", headers=auth(tokens[1])).json()["items"]
    r = client.get(f"/api/v1/claims/{items[0]['aon_claim_id']}/messages")
    assert r.status_code == 401


# ── Cross-device draft continuity ─────────────────────────────────────────────


def test_drafts_seeded_draft_is_resumable_by_owner(client, tokens):
    """Persona 5 has a seeded draft parked from another device."""
    r = client.get("/api/v1/fnol/drafts", headers=auth(tokens[5]))
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(d["draft_id"] == "DRAFT-SEED-0001" for d in items)

    seeded = next(d for d in items if d["draft_id"] == "DRAFT-SEED-0001")
    # The device label is what makes cross-device continuity visible in the UI.
    assert seeded["last_device"]
    assert seeded["current_step"] >= 1


def test_drafts_resume_returns_wizard_state(client, tokens):
    r = client.get("/api/v1/fnol/drafts/DRAFT-SEED-0001", headers=auth(tokens[5]))
    assert r.status_code == 200
    body = r.json()
    assert "values" in body
    assert body["values"].get("loss_description"), "draft payload did not survive"


def test_drafts_are_private_to_their_owner(client, tokens):
    """
    Persona 3 is Persona 5's parent in the hierarchy and can see their claims, but
    an unfinished intake is personal - it must not appear in anyone else's list.
    """
    items = client.get("/api/v1/fnol/drafts", headers=auth(tokens[3])).json()["items"]
    assert all(d["draft_id"] != "DRAFT-SEED-0001" for d in items), (
        "another user's draft leaked into this list"
    )

    direct = client.get("/api/v1/fnol/drafts/DRAFT-SEED-0001", headers=auth(tokens[3]))
    assert direct.status_code == 404, "draft existence was confirmed to a non-owner"


def test_drafts_upsert_is_idempotent(client, tokens):
    """Repeated autosaves of one wizard session update a single row."""
    body = {
        "site_org_node": "SITE-JFK-T4-BISTRO",
        "label": "Autosave test",
        "current_step": 2,
        "last_device": "Edge on Windows",
        "values": {"loss_description": "first"},
    }
    first = client.put("/api/v1/fnol/drafts/DRAFT-TEST-IDEM", json=body, headers=auth(tokens[5]))
    assert first.status_code == 200

    body["values"] = {"loss_description": "second"}
    body["current_step"] = 4
    second = client.put("/api/v1/fnol/drafts/DRAFT-TEST-IDEM", json=body, headers=auth(tokens[5]))
    assert second.status_code == 200

    listed = client.get("/api/v1/fnol/drafts", headers=auth(tokens[5])).json()["items"]
    matches = [d for d in listed if d["draft_id"] == "DRAFT-TEST-IDEM"]
    assert len(matches) == 1, "autosave created duplicate drafts"
    assert matches[0]["current_step"] == 4

    resumed = client.get("/api/v1/fnol/drafts/DRAFT-TEST-IDEM", headers=auth(tokens[5])).json()
    assert resumed["values"]["loss_description"] == "second"


def test_drafts_reject_out_of_scope_site(client, tokens):
    """BR-005: a draft cannot be parked against a site outside the caller's scope."""
    r = client.put(
        "/api/v1/fnol/drafts/DRAFT-TEST-SCOPE",
        json={
            "site_org_node": "CORP-HOSP",
            "current_step": 1,
            "values": {},
        },
        headers=auth(tokens[5]),
    )
    assert r.status_code == 403


def test_drafts_cannot_overwrite_another_users_draft(client, tokens):
    """A caller claiming someone else's draft_id is refused, not silently granted."""
    r = client.put(
        "/api/v1/fnol/drafts/DRAFT-SEED-0001",
        json={"site_org_node": None, "current_step": 1, "values": {"hijacked": True}},
        headers=auth(tokens[3]),
    )
    assert r.status_code == 409

    # The owner's copy is untouched.
    owner = client.get("/api/v1/fnol/drafts/DRAFT-SEED-0001", headers=auth(tokens[5])).json()
    assert "hijacked" not in owner["values"]


def test_drafts_delete_removes_only_own_draft(client, tokens):
    client.put(
        "/api/v1/fnol/drafts/DRAFT-TEST-DELETE",
        json={"site_org_node": None, "current_step": 1, "values": {}},
        headers=auth(tokens[5]),
    )
    # A non-owner cannot delete it.
    assert client.delete(
        "/api/v1/fnol/drafts/DRAFT-TEST-DELETE", headers=auth(tokens[3])
    ).status_code == 404

    assert client.delete(
        "/api/v1/fnol/drafts/DRAFT-TEST-DELETE", headers=auth(tokens[5])
    ).status_code == 200

    listed = client.get("/api/v1/fnol/drafts", headers=auth(tokens[5])).json()["items"]
    assert all(d["draft_id"] != "DRAFT-TEST-DELETE" for d in listed)


def test_drafts_require_fnol_privilege(client, tokens):
    """Persona 1 holds no claims_fnol privilege, so has no drafts surface."""
    r = client.get("/api/v1/fnol/drafts", headers=auth(tokens[1]))
    assert r.status_code == 403


def test_drafts_require_auth(client):
    assert client.get("/api/v1/fnol/drafts").status_code == 401


# ── Regression: the notification centre was never reachable ───────────────────


def test_notifications_are_addressed_to_the_token_subject(client, tokens):
    """
    Seeded notifications were keyed on the persona display name while tokens carry
    sub="poc|persona-N", so every inbox was silently empty. Guards the fix.
    """
    r = client.get("/api/v1/notifications", headers=auth(tokens[1]))
    assert r.status_code == 200
    assert r.json()["items"], "Persona 1 inbox is empty - recipient_sub mismatch is back"


def test_notifications_mark_read_uses_patch(client, tokens):
    listed = client.get("/api/v1/notifications", headers=auth(tokens[1])).json()
    unread = next((n for n in listed["items"] if not n["is_read"]), None)
    if not unread:
        pytest.skip("no unread notification to mark")

    r = client.patch(
        f"/api/v1/notifications/{unread['notification_id']}/read",
        headers=auth(tokens[1]),
    )
    assert r.status_code == 200
    assert r.json()["is_read"] is True
