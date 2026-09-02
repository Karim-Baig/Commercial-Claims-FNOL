"""
Document provenance and audience enforcement - negative tests.

Traceability: BR-003, BR-007, BR-008, ADR-001, F-CC-09, NFR-05.

The requirement is that client-provided policy documents are never inadvertently
surfaced, and that internal and carrier-only material never reaches a client user.
These tests prove the filtering happens server-side, not in the browser.
"""
from conftest import P1_CSUITE, P3_JFK_DIRECTOR, P5_BISTRO_MGR, auth


def _first_claim(client, token):
    r = client.get("/api/v1/claims", params={"page_size": 5}, headers=auth(token))
    return r.json()["items"][0]["aon_claim_id"]


def test_only_client_visible_documents_are_returned(client, tokens):
    claim_id = _first_claim(client, tokens[P5_BISTRO_MGR])
    r = client.get(f"/api/v1/claims/{claim_id}/documents", headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 200

    body = r.json()
    names = " ".join(d["doc_name"].lower() for d in body["items"])
    assert "adjuster" not in names, "internal document leaked"
    assert "carrier submission" not in names, "carrier-only document leaked"
    assert body["withheld"] >= 2, "expected internal and carrier-only files to be withheld"


def test_internal_documents_are_never_in_the_payload(client, tokens):
    """The filter must remove them from the response, not merely flag them."""
    from app.db import query

    claim_id = _first_claim(client, tokens[P3_JFK_DIRECTOR])
    stored = query("SELECT * FROM documents WHERE claim_id = :c", {"c": claim_id})
    internal_ids = {d["doc_id"] for d in stored if d["audience"] != "client_visible"}
    assert internal_ids, "fixture should include non-client documents"

    returned = {
        d["doc_id"]
        for d in client.get(f"/api/v1/claims/{claim_id}/documents",
                            headers=auth(tokens[P3_JFK_DIRECTOR])).json()["items"]
    }
    assert not (returned & internal_ids)


def test_ecm_reference_is_never_exposed(client, tokens):
    """ADR-001: files stay in ECM and the reference must not leave the service."""
    claim_id = _first_claim(client, tokens[P1_CSUITE])
    raw = client.get(f"/api/v1/claims/{claim_id}/documents",
                     headers=auth(tokens[P1_CSUITE])).text
    assert "ecm://" not in raw
    assert "filenet" not in raw.lower()


def test_direct_fetch_of_internal_document_is_denied(client, tokens):
    """Requesting the proxy URL directly must not bypass the audience gate."""
    from app.db import query

    claim_id = _first_claim(client, tokens[P5_BISTRO_MGR])
    internal = query(
        "SELECT doc_id FROM documents WHERE claim_id = :c AND audience != 'client_visible'",
        {"c": claim_id},
    )
    assert internal
    r = client.get(f"/api/v1/documents/{internal[0]['doc_id']}/content",
                   headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 403


def test_documents_on_out_of_scope_claim_are_denied(client, tokens):
    corp = client.get("/api/v1/claims", params={"page_size": 100},
                      headers=auth(tokens[P1_CSUITE])).json()["items"]
    foreign = next(i for i in corp if "LHR" in i["org_node"])
    r = client.get(f"/api/v1/claims/{foreign['aon_claim_id']}/documents",
                   headers=auth(tokens[P5_BISTRO_MGR]))
    assert r.status_code == 403


def test_document_privilege_is_required(client, tokens):
    """Persona 4 holds no claims_docs privilege, so the tab must be refused."""
    claim_id = _first_claim(client, tokens[4])
    r = client.get(f"/api/v1/claims/{claim_id}/documents", headers=auth(tokens[4]))
    assert r.status_code == 403
