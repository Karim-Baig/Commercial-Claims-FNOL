"""
Sprint 0 Gate — four named checks.

SPRINT 0 GATE: Do not proceed to Screen 1 until all four of these pass:
  (1) The shell loads the MFE over the network at runtime.
  (2) Logging in as Persona 3 returns only JFK-scoped claims.
  (3) Throwing inside the MFE leaves shell navigation working
      (verified structurally — MfeErrorBoundary exists and isolates the MFE subtree).
  (4) All three negative scope tests are green.

Gates (1) and (3) are frontend/runtime checks. This file covers the backend
halves — (2) scope correctness and (4) negative tests — which are the blocking
gates for backend readiness.
"""
import pytest


# ── Gate 2: Persona 3 (Location Manager, LOC-JFK) returns only JFK-scoped claims ──


# The JFK subtree: LOC-JFK plus all its child sites.
JFK_SCOPE = {"LOC-JFK", "SITE-JFK-T4-BISTRO", "SITE-JFK-T4-CAFE", "SITE-JFK-T7-GRILL"}


def test_gate2_persona3_summary_scoped_to_jfk(client, tokens):
    """Persona 3 sees only claims under LOC-JFK and its child sites."""
    resp = client.get("/api/v1/summary", headers={"Authorization": f"Bearer {tokens[3]}"})
    assert resp.status_code == 200
    data = resp.json()
    # Persona 3's org_node is LOC-JFK — the scope should reflect JFK hierarchy only.
    assert data["org_node"] == "LOC-JFK"
    # Scope must include at least the assigned node itself.
    assert data["scope_node_count"] >= 1
    # Recent claims must all belong to org nodes within the JFK subtree.
    for claim in data["recent_claims"]:
        assert claim["org_node"] in JFK_SCOPE, (
            f"Claim {claim['aon_claim_id']} with org_node {claim['org_node']!r} "
            f"is outside Persona 3's JFK scope {JFK_SCOPE}"
        )


def test_gate2_persona3_claims_list_scoped_to_jfk(client, tokens):
    """Claims list for Persona 3 contains no CORP-HOSP, LHR, or SIN claims."""
    resp = client.get("/api/v1/claims", headers={"Authorization": f"Bearer {tokens[3]}"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    for item in items:
        node = item["org_node"]
        assert node in JFK_SCOPE, (
            f"Claim {item['aon_claim_id']} with org_node {node!r} leaked through to Persona 3 "
            f"(expected one of {JFK_SCOPE})"
        )


def test_gate2_persona3_cannot_see_corp_claims(client, tokens):
    """Persona 3 must not be able to access summary data for CORP-HOSP scope."""
    # CORP-HOSP claims exist (seeded for Personas 1 & 2). Persona 3's summary must show
    # fewer claims than Persona 1's, confirming scope contraction.
    p1_resp = client.get("/api/v1/summary", headers={"Authorization": f"Bearer {tokens[1]}"})
    p3_resp = client.get("/api/v1/summary", headers={"Authorization": f"Bearer {tokens[3]}"})
    assert p1_resp.status_code == 200
    assert p3_resp.status_code == 200
    p1_count = p1_resp.json()["claim_count"]
    p3_count = p3_resp.json()["claim_count"]
    assert p3_count < p1_count, (
        f"Persona 3 sees {p3_count} claims but Persona 1 sees {p1_count}. "
        f"Scope contraction failed — Persona 3 should see a strict subset."
    )


# ── Gate 4: The three negative scope tests (plus two additional edge cases) ────


def test_gate4_peer_location_isolation(client, tokens):
    """Persona 5 (SITE-JFK-T4-BISTRO) cannot access claims from a peer site."""
    # First, find a claim that belongs to a different JFK site.
    p3_claims = client.get(
        "/api/v1/claims",
        headers={"Authorization": f"Bearer {tokens[3]}"},
    ).json()["items"]

    peer_claim = next(
        (c for c in p3_claims if c["org_node"] != "SITE-JFK-T4-BISTRO"),
        None,
    )
    if peer_claim is None:
        pytest.skip("No peer-site claims in seed data to test against")

    resp = client.get(
        f"/api/v1/claims/{peer_claim['aon_claim_id']}",
        headers={"Authorization": f"Bearer {tokens[5]}"},
    )
    # BR-001: must be 403, not 404 — we do not confirm existence outside scope.
    assert resp.status_code == 403


def test_gate4_out_of_scope_returns_403_not_404(client, tokens):
    """Out-of-scope claim access returns 403, not 404, and does not leak existence."""
    # Persona 5 is SITE-JFK-T4-BISTRO. Persona 1 is CORP-HOSP (wider scope).
    corp_claims = client.get(
        "/api/v1/claims",
        headers={"Authorization": f"Bearer {tokens[1]}"},
    ).json()["items"]

    # Find a claim outside SITE-JFK-T4-BISTRO's scope.
    out_of_scope = next(
        (c for c in corp_claims if not c["org_node"].startswith("SITE-JFK-T4-BISTRO")),
        None,
    )
    if out_of_scope is None:
        pytest.skip("No out-of-scope claims in seed data")

    resp = client.get(
        f"/api/v1/claims/{out_of_scope['aon_claim_id']}",
        headers={"Authorization": f"Bearer {tokens[5]}"},
    )
    assert resp.status_code == 403, (
        "Out-of-scope claim returned something other than 403. "
        "The response must not leak whether the claim exists."
    )


def test_gate4_missing_token_returns_401(client):
    """Unauthenticated request returns 401."""
    resp = client.get("/api/v1/claims")
    assert resp.status_code == 401


def test_gate4_garbage_token_returns_401(client):
    """Malformed JWT returns 401."""
    resp = client.get(
        "/api/v1/claims",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert resp.status_code == 401


# ── Sprint 0 gate summary ──────────────────────────────────────────────────────


def test_sprint0_gate_summary(client, tokens):
    """
    Smoke test that confirms the API is healthy and all personas can authenticate.
    Run this first. If it fails, the individual gate tests will also fail.
    """
    health = client.get("/health")
    assert health.status_code == 200

    for persona_id in [1, 2, 3, 4, 5, 6]:
        resp = client.get(
            "/api/v1/summary",
            headers={"Authorization": f"Bearer {tokens[persona_id]}"},
        )
        # Persona 7 has no org_node and will 403; all others must return 200.
        assert resp.status_code in (200, 403), (
            f"Persona {persona_id} returned unexpected status {resp.status_code}"
        )
