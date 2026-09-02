"""
Saved and shareable claims views.

Requirement: Figure 3 (p. 16) shows saved views on the claims list; Epic 3 (p. 62)
specifies "Advanced Search & Saved Filters - multi-criteria search (status, LOB, date
range, adjuster, reserve amount) with saved and shareable views".

Sharing model
-------------
The RFP does not define who a shared view is shared *with*, so this implementation
reuses the organisational scope model rather than inventing a second one:

    A shared view is visible to a user if the view's org_node falls inside that
    user's authorised scope.

That follows BR-001 downward inheritance exactly. A view saved by a location manager is
visible to the corporate user above them; a view saved at corporate level is not pushed
down to a site manager. No new security surface is introduced, and the visibility rule
is testable with the scope list that already exists.

A saved view stores filter criteria only - never claim data - so it carries no claim
PII. The view name is user-supplied free text and is length-capped.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import execute, expand_in, query, query_one
from ..services import audit

router = APIRouter(prefix="/views", tags=["views"])

# Only these keys may be persisted in a saved view. An unknown key is dropped rather
# than stored, so a view can never smuggle a parameter the list endpoint would honour.
ALLOWED_FILTER_KEYS = {
    "tab", "q", "status", "sub_status", "product", "product_category",
    "adjuster", "date_from", "date_to", "reserve_min", "reserve_max",
    "claim_type", "cause_of_loss", "consequence_of_loss", "carrier",
    "sort", "dir",
}

MAX_VIEWS_PER_USER = 50


class SavedViewIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    filters: dict = Field(default_factory=dict)
    is_shared: bool = False


def _sanitise(filters: dict) -> dict:
    """Drops unknown keys and anything empty."""
    return {
        k: v for k, v in (filters or {}).items()
        if k in ALLOWED_FILTER_KEYS and v not in (None, "", [])
    }


def _row_to_view(r: dict, viewer_sub: str) -> dict:
    return {
        "view_id": r["view_id"],
        "name": r["name"],
        "filters": json.loads(r["filters_json"]),
        "is_shared": bool(r["is_shared"]),
        "org_node": r["org_node"],
        "owner_name": r["owner_name"],
        "owned_by_me": r["owner_sub"] == viewer_sub,
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


@router.get("")
def list_views(sp: ScopedPrincipal = Depends(current_scope)):
    """
    Returns the caller's own views plus shared views inside their authorised scope.

    The scope clause is the same list used for claims, so a shared view can never
    reference an organisational node the caller cannot already see.
    """
    clause, params = sp.scope_clause()
    tenant_sql, tenant_params = sp.tenant_clause()
    params.update(tenant_params)
    params["me"] = sp.sub

    rows = query(
        # The tenant predicate wraps both branches. A user's own views are
        # inherently same-tenant, but filtering anyway means a mis-stamped row
        # cannot surface through the owner branch.
        f"""SELECT * FROM saved_views
            WHERE {tenant_sql}
              AND (owner_sub = :me OR (is_shared = 1 AND {clause}))
            ORDER BY is_shared, name""",
        params,
    )
    return {"items": [_row_to_view(r, sp.sub) for r in rows]}


@router.post("", status_code=201)
def create_view(body: SavedViewIn, sp: ScopedPrincipal = Depends(current_scope)):
    if not sp.principal.org_node:
        raise HTTPException(403, "No valid organisational node")

    existing = query_one(
        "SELECT COUNT(*) AS n FROM saved_views WHERE owner_sub = :me", {"me": sp.sub}
    ) or {}
    if int(existing.get("n") or 0) >= MAX_VIEWS_PER_USER:
        raise HTTPException(409, f"Saved view limit of {MAX_VIEWS_PER_USER} reached")

    view_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    execute(
        """INSERT INTO saved_views
               (view_id, owner_sub, owner_name, org_node, client_id, name,
                filters_json, is_shared, created_at, updated_at)
           VALUES (:vid, :me, :nm, :org, :client, :name, :filters, :shared, :now, :now)""",
        {
            # Tenant comes from the resolved scope, never from the request body.
            "client": sp.client_id,
            "vid": view_id, "me": sp.sub, "nm": sp.principal.name,
            "org": sp.principal.org_node, "name": body.name.strip(),
            "filters": json.dumps(_sanitise(body.filters)),
            "shared": 1 if body.is_shared else 0, "now": now,
        },
    )
    audit.log(sp.sub, "view.create", "saved_view", view_id, sp.principal.org_node)

    row = query_one("SELECT * FROM saved_views WHERE view_id = :v", {"v": view_id})
    return _row_to_view(row, sp.sub)


@router.patch("/{view_id}")
def update_view(
    view_id: str = Path(...),
    body: SavedViewIn = ...,
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Only the owner may modify a view. Being able to see it is not enough."""
    row = query_one("SELECT * FROM saved_views WHERE view_id = :v", {"v": view_id})
    if not row:
        raise HTTPException(404, "View not found")
    if row["owner_sub"] != sp.sub:
        audit.log_denied(sp.sub, "view.update", "saved_view", view_id)
        raise HTTPException(403, "Only the owner of a view may modify it")

    execute(
        """UPDATE saved_views
              SET name = :name, filters_json = :filters, is_shared = :shared,
                  updated_at = :now
            WHERE view_id = :v""",
        {
            "v": view_id, "name": body.name.strip(),
            "filters": json.dumps(_sanitise(body.filters)),
            "shared": 1 if body.is_shared else 0,
            "now": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    )
    audit.log(sp.sub, "view.update", "saved_view", view_id, row["org_node"])
    return _row_to_view(
        query_one("SELECT * FROM saved_views WHERE view_id = :v", {"v": view_id}), sp.sub
    )


@router.delete("/{view_id}", status_code=204)
def delete_view(view_id: str = Path(...), sp: ScopedPrincipal = Depends(current_scope)):
    row = query_one("SELECT * FROM saved_views WHERE view_id = :v", {"v": view_id})
    if not row:
        raise HTTPException(404, "View not found")
    if row["owner_sub"] != sp.sub:
        audit.log_denied(sp.sub, "view.delete", "saved_view", view_id)
        raise HTTPException(403, "Only the owner of a view may delete it")

    execute("DELETE FROM saved_views WHERE view_id = :v", {"v": view_id})
    audit.log(sp.sub, "view.delete", "saved_view", view_id, row["org_node"])
    return None
