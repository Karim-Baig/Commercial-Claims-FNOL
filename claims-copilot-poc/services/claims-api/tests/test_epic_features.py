"""
Tests for the five features built against the "no external dependency" list:

  Epic 8 — notification rules and per-channel preferences
  Epic 1 — claim pinning
  Epic 2 — FNOL draft delegation
  Epic 6 — client and country branding, timezone labelling
  Epic 4 — analytics presentation container and drill-down

The emphasis is on the security properties rather than the happy paths: every one of
these features stores something against a user, and each therefore needs proving that
it cannot be used to reach a claim, a draft or a colleague outside the caller's scope.
"""
import uuid
from urllib.parse import urlencode

from conftest import (
    P1_CSUITE, P3_JFK_DIRECTOR, P5_BISTRO_MGR, P6_REPORTER, P7_UNAUTHORISED, auth,
)

API = "/api/v1"


# ── Epic 8: notification rules ────────────────────────────────────────────────

def test_preferences_expose_the_rule_catalogue(client, tokens):
    r = client.get(f"{API}/preferences", headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 200
    body = r.json()

    events = {e["event_type"] for e in body["notification_events"]}
    assert {"fnol_acknowledged", "reserve_set", "message_received"} <= events

    channels = {c["channel"]: c["available"] for c in body["notification_channels"]}
    assert channels["in_app"] is True
    # The honest half of Epic 8: the preference exists, the transport does not.
    assert channels["email"] is False and channels["sms"] is False

    # Every catalogued event must have a default rule, or the UI renders a blank row.
    assert all(e in body["notifications"] for e in events)


def test_notification_rules_round_trip_and_reject_unknown_keys(client, tokens):
    tok = tokens[P3_JFK_DIRECTOR]
    base = client.get(f"{API}/preferences", headers=auth(tok)).json()

    rules = base["notifications"]
    rules["reserve_set"] = {"in_app": False, "email": True, "sms": True}
    r = client.put(
        f"{API}/preferences",
        headers=auth(tok),
        json={"kpi_order": base["kpi_order"], "kpi_hidden": base["kpi_hidden"],
              "notifications": rules},
    )
    assert r.status_code == 200
    stored = client.get(f"{API}/preferences", headers=auth(tok)).json()["notifications"]
    assert stored["reserve_set"] == {"in_app": False, "email": True, "sms": True}

    assert client.put(
        f"{API}/preferences", headers=auth(tok),
        json={"notifications": {"not_an_event": {"in_app": True}}},
    ).status_code == 422
    assert client.put(
        f"{API}/preferences", headers=auth(tok),
        json={"notifications": {"reserve_set": {"carrier_pigeon": True}}},
    ).status_code == 422

    client.delete(f"{API}/preferences", headers=auth(tok))


def test_rules_are_evaluated_at_write_time_and_suppress_the_bell(client, tokens):
    """
    Turning in-app off for an event must keep it out of the bell but still record the
    event and still route the channels left on.
    """
    tok = tokens[P5_BISTRO_MGR]
    base = client.get(f"{API}/preferences", headers=auth(tok)).json()
    rules = base["notifications"]
    # Both FNOL outcomes are configured the same way: the outbox simulates Appian being
    # unavailable a fraction of the time, so the submission below legitimately emits
    # either fnol_acknowledged or fnol_queued. Pinning both keeps the assertion about
    # the routing rules rather than about which branch the simulation took.
    rules["fnol_acknowledged"] = {"in_app": False, "email": True, "sms": False}
    rules["fnol_queued"] = {"in_app": False, "email": True, "sms": False}
    client.put(
        f"{API}/preferences", headers=auth(tok),
        json={"kpi_order": base["kpi_order"], "kpi_hidden": base["kpi_hidden"],
              "notifications": rules},
    )

    before = len(client.get(f"{API}/notifications", headers=auth(tok)).json()["items"])
    deliveries_before = len(
        client.get(f"{API}/notifications/deliveries", headers=auth(tok)).json()["items"]
    )

    r = client.post(
        f"{API}/fnol", headers={**auth(tok), "Idempotency-Key": str(uuid.uuid4())},
        json={"site_org_node": "SITE-JFK-T4-BISTRO", "date_of_loss": "2026-08-18",
              "product_line": "Property & Equipment", "cause_of_loss": "Fire",
              "loss_description": "Extraction canopy fire."},
    )
    assert r.status_code == 202

    after = client.get(f"{API}/notifications", headers=auth(tok)).json()["items"]
    assert len(after) == before, "in-app was off, so the bell must not have grown"

    ledger = client.get(f"{API}/notifications/deliveries", headers=auth(tok)).json()
    assert len(ledger["items"]) > deliveries_before, "the email routing must be recorded"
    assert ledger["pending_provider_count"] >= 1

    pending = [i for i in ledger["items"] if i["state"] == "pending_provider"]
    assert all(i["channel"] in ("email", "sms") for i in pending)
    assert all(i["detail"] for i in pending), "an unsendable channel must say why"

    client.delete(f"{API}/preferences", headers=auth(tok))


def test_deliveries_are_private_to_the_recipient(client, tokens):
    """One user's routing ledger must never contain another user's rows."""
    mine = client.get(
        f"{API}/notifications/deliveries", headers=auth(tokens[P6_REPORTER])
    ).json()["items"]
    other = client.get(
        f"{API}/notifications/deliveries", headers=auth(tokens[P1_CSUITE])
    ).json()["items"]
    assert not ({i["delivery_id"] for i in mine} & {i["delivery_id"] for i in other})


# ── Epic 1: claim pinning ─────────────────────────────────────────────────────

def _first_visible_claim(client, token) -> str:
    items = client.get(f"{API}/claims?page_size=1", headers=auth(token)).json()["items"]
    assert items, "fixture expected at least one visible claim"
    return items[0]["aon_claim_id"]


def test_pin_lifecycle(client, tokens):
    tok = tokens[P3_JFK_DIRECTOR]
    claim_id = _first_visible_claim(client, tok)

    r = client.put(f"{API}/claims/{claim_id}/pin", headers=auth(tok), json={"note": "watching"})
    assert r.status_code == 201

    pins = client.get(f"{API}/pins", headers=auth(tok)).json()
    assert claim_id in {p["claim_id"] for p in pins["items"]}
    pinned = next(p for p in pins["items"] if p["claim_id"] == claim_id)
    assert pinned["note"] == "watching"
    # The list joins the claim, so the pin is useful without a second round trip.
    assert pinned["status"] and pinned["loss_description"]

    # Re-pinning is idempotent and updates the note rather than erroring.
    assert client.put(
        f"{API}/claims/{claim_id}/pin", headers=auth(tok), json={"note": "chasing estimate"}
    ).status_code == 201
    again = client.get(f"{API}/pins", headers=auth(tok)).json()["items"]
    assert [p for p in again if p["claim_id"] == claim_id][0]["note"] == "chasing estimate"
    assert len([p for p in again if p["claim_id"] == claim_id]) == 1

    assert client.delete(f"{API}/claims/{claim_id}/pin", headers=auth(tok)).status_code == 200
    assert claim_id not in {
        p["claim_id"] for p in client.get(f"{API}/pins", headers=auth(tok)).json()["items"]
    }


def test_cannot_pin_a_claim_outside_scope(client, tokens):
    """BR-001 applies to pinning: a pin must not be a way to name an unseen claim."""
    corporate_claim = _first_visible_claim(client, tokens[P1_CSUITE])
    bistro = tokens[P5_BISTRO_MGR]

    visible = {
        c["aon_claim_id"]
        for c in client.get(f"{API}/claims?page_size=100", headers=auth(bistro)).json()["items"]
    }
    if corporate_claim in visible:
        return  # nothing to prove on this fixture

    r = client.put(f"{API}/claims/{corporate_claim}/pin", headers=auth(bistro), json={})
    assert r.status_code == 403


def test_pins_are_per_user(client, tokens):
    a, b = tokens[P3_JFK_DIRECTOR], tokens[P1_CSUITE]
    claim_id = _first_visible_claim(client, a)
    client.put(f"{API}/claims/{claim_id}/pin", headers=auth(a), json={})

    other = client.get(f"{API}/pins", headers=auth(b)).json()["items"]
    assert claim_id not in {p["claim_id"] for p in other}, "a pin leaked between users"

    client.delete(f"{API}/claims/{claim_id}/pin", headers=auth(a))


def test_reporter_cannot_pin_a_claim_they_did_not_submit(client, tokens):
    """claims_own_only is re-checked on pin, not just on list."""
    others = client.get(f"{API}/claims?page_size=100", headers=auth(tokens[P1_CSUITE])).json()
    not_mine = [
        c["aon_claim_id"] for c in others["items"] if c["submitted_by"] != "Tom Beckett"
    ]
    assert not_mine
    r = client.put(f"{API}/claims/{not_mine[0]}/pin", headers=auth(tokens[P6_REPORTER]), json={})
    assert r.status_code == 403


def test_pins_require_authentication(client, tokens):
    assert client.get(f"{API}/pins").status_code in (401, 403)
    assert client.get(f"{API}/pins", headers=auth(tokens[P7_UNAUTHORISED])).status_code in (401, 403)


# ── Epic 2: FNOL delegation ───────────────────────────────────────────────────

def _new_draft(client, token, label="Delegation test") -> str:
    draft_id = f"DRAFT-{uuid.uuid4().hex[:8].upper()}"
    r = client.put(
        f"{API}/fnol/drafts/{draft_id}", headers=auth(token),
        json={"site_org_node": "SITE-JFK-T4-BISTRO", "label": label,
              "current_step": 2, "values": {"cause_of_loss": "Fire"}},
    )
    assert r.status_code == 200, r.text
    return draft_id


def test_delegate_candidates_are_limited_to_scope_and_privilege(client, tokens):
    items = client.get(f"{API}/fnol/delegates", headers=auth(tokens[P5_BISTRO_MGR])).json()["items"]
    subs = {d["sub"] for d in items}

    # A site manager may delegate sideways, never to corporate above them.
    assert "poc|persona-1" not in subs
    assert "poc|persona-5" not in subs, "the caller must not be offered to themselves"
    assert subs, "the bistro fixture has a second FNOL-capable user"


def test_delegation_grants_edit_but_not_deletion(client, tokens):
    owner, delegate = tokens[P5_BISTRO_MGR], tokens[P6_REPORTER]
    draft_id = _new_draft(client, owner)

    r = client.post(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner),
        json={"delegate_sub": "poc|persona-6"},
    )
    assert r.status_code == 200
    assert r.json()["delegate_name"] == "Tom Beckett"
    assert r.json()["delegated_by_name"] == "Maria Santos"

    listed = client.get(f"{API}/fnol/drafts", headers=auth(delegate)).json()["items"]
    mine = [d for d in listed if d["draft_id"] == draft_id]
    assert mine, "a delegated draft must appear in the delegate's list"
    assert mine[0]["owned_by_me"] is False

    assert client.get(f"{API}/fnol/drafts/{draft_id}", headers=auth(delegate)).status_code == 200
    assert client.put(
        f"{API}/fnol/drafts/{draft_id}", headers=auth(delegate),
        json={"site_org_node": "SITE-JFK-T4-BISTRO", "label": "Edited by delegate",
              "current_step": 3, "values": {"cause_of_loss": "Fire"}},
    ).status_code == 200

    # Destroying someone else's intake is not a delegate's call.
    assert client.delete(f"{API}/fnol/drafts/{draft_id}", headers=auth(delegate)).status_code == 404
    assert client.delete(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(delegate)
    ).status_code == 404

    assert client.delete(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner)
    ).status_code == 200
    after = client.get(f"{API}/fnol/drafts", headers=auth(delegate)).json()["items"]
    assert draft_id not in {d["draft_id"] for d in after}

    client.delete(f"{API}/fnol/drafts/{draft_id}", headers=auth(owner))


def test_cannot_delegate_outside_scope_or_to_self(client, tokens):
    owner = tokens[P5_BISTRO_MGR]
    draft_id = _new_draft(client, owner)

    # Persona 1 is corporate — above the site manager, so outside their scope.
    assert client.post(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner),
        json={"delegate_sub": "poc|persona-1"},
    ).status_code == 403

    assert client.post(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner),
        json={"delegate_sub": "poc|persona-5"},
    ).status_code == 422

    assert client.post(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner),
        json={"delegate_sub": "attacker|root"},
    ).status_code == 403

    client.delete(f"{API}/fnol/drafts/{draft_id}", headers=auth(owner))


def test_delegation_notifies_the_delegate(client, tokens):
    owner, delegate = tokens[P5_BISTRO_MGR], tokens[P6_REPORTER]
    draft_id = _new_draft(client, owner, label="Fryer fire T4")
    client.post(
        f"{API}/fnol/drafts/{draft_id}/delegate", headers=auth(owner),
        json={"delegate_sub": "poc|persona-6"},
    )

    events = [
        n["event_type"]
        for n in client.get(f"{API}/notifications", headers=auth(delegate)).json()["items"]
    ]
    assert "fnol_delegated" in events

    client.delete(f"{API}/fnol/drafts/{draft_id}", headers=auth(owner))


def test_a_stranger_cannot_reach_a_draft(client, tokens):
    draft_id = _new_draft(client, tokens[P5_BISTRO_MGR])
    # Persona 3 is above the bistro in the hierarchy, but drafts are not inherited:
    # delegation is explicit, so scope alone must not open someone's unfinished intake.
    assert client.get(
        f"{API}/fnol/drafts/{draft_id}", headers=auth(tokens[P3_JFK_DIRECTOR])
    ).status_code == 404
    client.delete(f"{API}/fnol/drafts/{draft_id}", headers=auth(tokens[P5_BISTRO_MGR]))


# ── Epic 6: branding and country configuration ────────────────────────────────

def test_branding_resolves_client_over_default(client, tokens):
    r = client.get(f"{API}/config/branding", headers=auth(tokens[P1_CSUITE]))
    assert r.status_code == 200
    body = r.json()
    assert body["client_key"] == "Hospitality Group Inc."
    assert body["brand_name"] == "Hospitality Group"
    # Every token the container needs must be present even if a layer omitted it.
    for key in ("primary", "accent", "header_bg", "header_fg", "logo_text",
                "timezone", "timezone_label"):
        assert body.get(key), f"missing brand token: {key}"


def test_branding_country_layer_overrides_timezone(client, tokens):
    tok = auth(tokens[P1_CSUITE])
    us = client.get(f"{API}/config/branding?country=US", headers=tok).json()
    sg = client.get(f"{API}/config/branding?country=SG", headers=tok).json()

    assert us["timezone"] == "America/New_York" and us["timezone_label"] == "ET"
    assert sg["timezone"] == "Asia/Singapore" and sg["timezone_label"] == "SGT"
    # The country layer overrode only what it named; brand identity is unchanged.
    assert us["brand_name"] == sg["brand_name"]


def test_branding_ignores_unknown_country_and_needs_auth(client, tokens):
    r = client.get(f"{API}/config/branding?country=ZZ", headers=auth(tokens[P1_CSUITE]))
    assert r.status_code == 200
    assert r.json()["timezone"], "an unknown country must fall back, not blank the brand"
    assert client.get(f"{API}/config/branding").status_code in (401, 403)


def test_country_config_is_served_for_rtl_market(client, tokens):
    r = client.get(f"{API}/config/countries/AE", headers=auth(tokens[P1_CSUITE]))
    assert r.status_code == 200
    body = r.json()
    assert body["text_direction"] == "rtl"
    assert body["currency"] == "AED"
    assert client.get(
        f"{API}/config/countries/ZZ", headers=auth(tokens[P1_CSUITE])
    ).status_code == 404


# ── Epic 4: analytics container and drill-down ────────────────────────────────

def test_analytics_requires_the_analytics_privilege(client, tokens):
    # Persona 5 holds claims_viewer and claims_fnol but not claims_analytics.
    assert client.get(
        f"{API}/analytics/dimensions", headers=auth(tokens[P5_BISTRO_MGR])
    ).status_code == 403
    assert client.get(
        f"{API}/analytics/aggregate?dimension=product", headers=auth(tokens[P5_BISTRO_MGR])
    ).status_code == 403


def test_analytics_catalogue_only_advertises_drillable_dimensions_it_can_honour(client, tokens):
    body = client.get(f"{API}/analytics/dimensions", headers=auth(tokens[P1_CSUITE])).json()
    assert body["source"] == "poc_claims", "the container must declare its data source"

    drillable = {d["key"] for d in body["dimensions"] if d["drillable"]}
    assert {"product", "status", "cause_of_loss", "carrier"} <= drillable

    # Every advertised drill-down must be a filter the claims list actually accepts.
    for key in drillable:
        r = client.get(f"{API}/claims?{key}=Fire&page_size=1", headers=auth(tokens[P1_CSUITE]))
        assert r.status_code == 200, f"{key} is advertised as drillable but the list rejects it"


def test_analytics_totals_match_the_claims_list_for_the_same_scope(client, tokens):
    tok = auth(tokens[P3_JFK_DIRECTOR])
    agg = client.get(f"{API}/analytics/aggregate?dimension=product", headers=tok).json()
    listed = client.get(f"{API}/claims?page_size=1", headers=tok).json()

    assert agg["totals"]["claim_count"] == listed["total"], (
        "an aggregate that disagrees with the list is worse than no aggregate"
    )
    assert sum(i["claim_count"] for i in agg["items"]) == agg["totals"]["claim_count"]


def test_analytics_is_scoped_per_persona(client, tokens):
    corp = client.get(
        f"{API}/analytics/aggregate?dimension=product", headers=auth(tokens[P1_CSUITE])
    ).json()["totals"]["claim_count"]
    jfk = client.get(
        f"{API}/analytics/aggregate?dimension=product", headers=auth(tokens[P3_JFK_DIRECTOR])
    ).json()["totals"]["claim_count"]
    assert jfk < corp, "BR-001 must narrow the aggregate, not just the list"


def test_drill_down_filters_round_trip_into_the_claims_list(client, tokens):
    """
    The drill-down contract: the filters an aggregate row hands back must select
    exactly the claims that row counted.
    """
    tok = auth(tokens[P1_CSUITE])
    agg = client.get(f"{API}/analytics/aggregate?dimension=cause_of_loss", headers=tok).json()

    row = next(r for r in agg["items"] if r["filters"])
    query = urlencode({**row["filters"], "page_size": 1})
    listed = client.get(f"{API}/claims?{query}", headers=tok).json()

    assert listed["total"] == row["claim_count"], (
        f"drill-down for {row['label']} showed {listed['total']} of {row['claim_count']}"
    )


def test_aggregate_can_be_regrouped_under_a_drill_down(client, tokens):
    """A container, not a fixed report: filter by one dimension then group by another."""
    tok = auth(tokens[P1_CSUITE])
    by_product = client.get(f"{API}/analytics/aggregate?dimension=product", headers=tok).json()
    product = by_product["items"][0]["key"]

    regrouped = client.get(
        f"{API}/analytics/aggregate?{urlencode({'dimension': 'status', 'product': product})}",
        headers=tok,
    ).json()
    assert regrouped["applied_filters"]["product"] == product
    assert regrouped["totals"]["claim_count"] == by_product["items"][0]["claim_count"]


def test_unknown_dimension_is_rejected(client, tokens):
    r = client.get(
        f"{API}/analytics/aggregate?dimension=drop_table", headers=auth(tokens[P1_CSUITE])
    )
    assert r.status_code == 422
