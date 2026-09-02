"""
Document access through the S-DMS proxy over ECM.

Implements ADR-001 and Pillar 1: document files remain in ECM/FileNet and S-DMS holds
references only, proxying access through its RBAC layer. Three rules are enforced here
rather than in the client:

  * F-CC-09 - client users receive only documents classified client_visible.
              Internal and carrier_only files are removed before the response is built.
  * NFR-05  - the document-level security attribute is checked in addition to audience.
  * BR-008  - client-provided policy documents carry provenance metadata so no consumer,
              including broker-facing services, can inadvertently surface them.

The ECM reference never leaves the service. Clients receive a proxy URL.
"""
from typing import Any

from ..db import expand_in, query, query_one


def get_claim_in_scope(
    claim_id: str, scope: list[str], client_id: str | None = None
) -> dict[str, Any] | None:
    """
    Fetches a claim only if it is inside the caller's scope.

    client_id is optional for backwards compatibility with existing call sites, but
    every caller in this service passes it. Without it the lookup falls back to node
    scope alone, which is correct within a tenant and insufficient across tenants -
    hence the tenancy tests assert on the routes, not on this helper.
    """
    clause, params = expand_in("s", scope)
    tenant_sql = ""
    if client_id:
        tenant_sql = " AND client_id = :tenant_client_id"
        params["tenant_client_id"] = client_id
    return query_one(
        f"SELECT * FROM claims WHERE aon_claim_id = :cid "
        f"AND org_node IN {clause}{tenant_sql}",
        {"cid": claim_id, **params},
    )


def list_claim_documents(
    claim_id: str, is_broker: bool = False
) -> tuple[list[dict[str, Any]], int]:
    """Returns (visible documents, count withheld). The caller must already have
    confirmed the claim is inside the requester's organisational scope."""
    rows = query(
        "SELECT * FROM documents WHERE claim_id = :cid ORDER BY uploaded_at DESC",
        {"cid": claim_id},
    )

    visible: list[dict[str, Any]] = []
    for d in rows:
        # F-CC-09 audience gate.
        if d["audience"] != "client_visible":
            continue
        # NFR-05 document-level attribute gate.
        if d["security_attr"] == "internal":
            continue
        # BR-008 provenance gate.
        if is_broker and d.get("provenance") == "client_provided_via_claims":
            continue
        visible.append(
            {
                "doc_id": d["doc_id"],
                "claim_id": d["claim_id"],
                "doc_name": d["doc_name"],
                "doc_type": d["doc_type"],
                "size_bytes": d["size_bytes"],
                "uploaded_at": d["uploaded_at"],
                "security_attr": d["security_attr"],
                # ecm_reference is deliberately absent.
                "url": f"/api/v1/documents/{d['doc_id']}/content",
            }
        )

    return visible, len(rows) - len(visible)
