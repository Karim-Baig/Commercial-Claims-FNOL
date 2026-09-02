"""
Organisational scope enforcement - negative tests.

Workstream 3 requires evidence that no user can access claims, documents or analytics
outside their authorised organisational scope. These tests are that evidence, and they
run on every commit rather than as a pre-release exercise.

Traceability: BR-001, BR-005, F-CC-07.
"""
from conftest import (
    P1_CSUITE, P3_JFK_DIRECTOR, P5_BISTRO_MGR, P6_REPORTER, P7_UNAUTHORISED, auth,
)


# ── BR-001: downward inheritance only ────────────────────────────────────

def test_location_manager_cannot_see_peer_location(client, tokens):
    """A LOC-JFK user must never see LOC-LHR or LOC-SIN claims."""
    r = client.get("/api/v1/claims", params={"page_size": 100},
                   headers=auth(tokens[P3_JFK_DIRECTOR]))
    assert r.status_code == 200
    nodes = {i["org_node"] for i in r.json()["items"]}
    assert nodes, "expected the JFK director to see at least one claim"
    assert all(n.startswith("LOC-JFK") or n.startswith("SITE-JFK") for n in nodes), nodes
    assert not any("LHR" in n or "SIN" in n for n in nodes)


def test_site_manager_cannot_see_parent_location_claims(client, tokens):
    """Upward inheritance is forbidden: a site user sees no LOC-JFK-level claims."""
    r = client.get("/api/v1/claims", params={"page_size": 100},
                   headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 200
    nodes = {i["org_node"] for i in r.json()["items"]}
    assert nodes == {"SITE-JFK-T4-BISTRO"}, nodes


def test_site_manager_cannot_see_sibling_site_claims(client, tokens):
    """The Bistro manager must not see Cafe or Grill claims."""
    r = client.get("/api/v1/claims", params={"page_size": 100},
                   headers=auth(tokens[P5_BISTRO_MGR]))
    nodes = {i["org_node"] for i in r.json()["items"]}
    assert "SITE-JFK-T4-CAFE" not in nodes
    assert "SITE-JFK-T7-GRILL" not in nodes


def test_scope_is_strictly_nested_across_personas(client, tokens):
    """Corporate scope must be a strict superset of location, and location of site."""
    def ids(pid):
        r = client.get("/api/v1/claims", params={"page_size": 100}, headers=auth(tokens[pid]))
        return {i["aon_claim_id"] for i in r.json()["items"]}

    corp, loc, site = ids(P1_CSUITE), ids(P3_JFK_DIRECTOR), ids(P5_BISTRO_MGR)
    assert site < loc < corp, (len(site), len(loc), len(corp))


# ── the token is the only source of scope ─────────────────────────────────

def test_org_node_query_param_cannot_override_jwt(client, tokens):
    """A client-supplied org_node must be ignored entirely."""
    baseline = client.get("/api/v1/claims", params={"page_size": 100},
                          headers=auth(tokens[P5_BISTRO_MGR])).json()["total"]
    escalated = client.get(
        "/api/v1/claims",
        params={"page_size": 100, "org_node": "CORP-HOSP", "scope": "CORP-HOSP"},
        headers=auth(tokens[P5_BISTRO_MGR]),
    ).json()["total"]
    assert escalated == baseline


def test_org_node_header_cannot_override_jwt(client, tokens):
    baseline = client.get("/api/v1/claims", params={"page_size": 100},
                          headers=auth(tokens[P5_BISTRO_MGR])).json()["total"]
    headers = {**auth(tokens[P5_BISTRO_MGR]), "X-Org-Node": "CORP-HOSP"}
    assert client.get("/api/v1/claims", params={"page_size": 100},
                      headers=headers).json()["total"] == baseline


# ── direct object access ──────────────────────────────────────────────────

def test_out_of_scope_claim_returns_403_not_404(client, tokens):
    """
    Existence must not leak. A claim outside scope returns 403, so the response is
    indistinguishable from an in-scope claim the caller may not read.
    """
    corp = client.get("/api/v1/claims", params={"page_size": 100},
                      headers=auth(tokens[P1_CSUITE])).json()["items"]
    foreign = next(i for i in corp if "LHR" in i["org_node"])

    r = client.get(f"/api/v1/claims/{foreign['aon_claim_id']}",
                   headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 403


def test_out_of_scope_claim_denial_is_audited(client, tokens):
    """A denial must leave a record (NFR-04)."""
    from app.db import query

    corp = client.get("/api/v1/claims", params={"page_size": 100},
                      headers=auth(tokens[P1_CSUITE])).json()["items"]
    foreign = next(i for i in corp if "SIN" in i["org_node"])
    client.get(f"/api/v1/claims/{foreign['aon_claim_id']}", headers=auth(tokens[P5_BISTRO_MGR]))

    rows = query(
        "SELECT * FROM audit_log WHERE outcome = 'denied' AND resource_id = :r",
        {"r": foreign["aon_claim_id"]},
    )
    assert rows, "expected a denied audit entry"


# ── BR-005: no organisational node means no access ───────────────────────

def test_unauthorised_persona_gets_403_on_every_data_route(client, tokens):
    for path in ("/api/v1/summary", "/api/v1/claims", "/api/v1/hierarchy"):
        r = client.get(path, headers=auth(tokens[P7_UNAUTHORISED]))
        assert r.status_code == 403, f"{path} returned {r.status_code}"


# ── authentication is required ────────────────────────────────────────────

def test_missing_token_is_rejected(client):
    assert client.get("/api/v1/claims").status_code == 401


def test_garbage_token_is_rejected(client):
    r = client.get("/api/v1/claims", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_token_signed_with_wrong_key_is_rejected(client):
    """A self-minted token must not be accepted."""
    import time
    import jwt

    forged = jwt.encode(
        {
            "sub": "attacker", "name": "Attacker", "org_node": "CORP-HOSP",
            "groups": ["claims_viewer", "claims_view_pii"], "persona_id": 99,
            "exp": int(time.time()) + 3600, "aud": "api://default",
        },
        "the-wrong-secret",
        algorithm="HS256",
    )
    assert client.get("/api/v1/claims", headers=auth(forged)).status_code == 401


# ── persona 6: own claims only ────────────────────────────────────────────

def test_reporter_sees_only_own_submissions(client, tokens):
    r = client.get("/api/v1/claims", params={"page_size": 100}, headers=auth(tokens[P6_REPORTER]))
    assert r.status_code == 200
    submitters = {i["submitted_by"] for i in r.json()["items"]}
    assert submitters <= {"Tom Beckett", "Maria Santos"}


# ── summary aggregates honour the same boundary (BR-002) ─────────────────

def test_summary_totals_shrink_as_scope_narrows(client, tokens):
    def incurred(pid):
        r = client.get("/api/v1/summary", headers=auth(tokens[pid]))
        return r.json()["kpis"]["total_gross_incurred"]["value"]

    assert incurred(P5_BISTRO_MGR) < incurred(P3_JFK_DIRECTOR) < incurred(P1_CSUITE)


def test_summary_claim_count_matches_list_total(client, tokens):
    """Aggregates and the list must agree, or one of them has a scope bug."""
    for pid in (P1_CSUITE, P3_JFK_DIRECTOR, P5_BISTRO_MGR):
        s = client.get("/api/v1/summary", headers=auth(tokens[pid])).json()
        l = client.get("/api/v1/claims", params={"page_size": 100},
                       headers=auth(tokens[pid])).json()
        assert s["claim_count"] == l["total"], f"persona {pid}"
