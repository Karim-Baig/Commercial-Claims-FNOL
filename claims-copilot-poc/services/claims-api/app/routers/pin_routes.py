"""
Claim pinning — Epic 1 (p. 61).

Epic 1 asks for pinning alongside dashboard personalisation. A pin is the one piece of
personalisation that points at a *record* rather than at a layout, which changes the
security question: a saved KPI order cannot leak anything, but a saved claim reference
could outlive the access that created it.

So a pin is re-authorised on every read rather than trusted:

  * the pin stores the claim's org_node, and the list endpoint filters that against
    the caller's live scope from the JWT (BR-001);
  * the restricted-access flag and the own-only privilege are re-checked on read, so a
    pin taken while a user had a privilege stops resolving when the privilege is removed;
  * pins are per user, so unpinning never mutates the claim and two people watching the
    same claim cannot see each other's pins.

A pin that no longer resolves is reported as a count rather than silently dropped. The
user pinned something; telling them it is no longer visible is more honest than making
the row disappear and leaving them to wonder.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import expand_in, get_conn, query, query_one
from ..services import audit
from ..services.sdms_proxy import get_claim_in_scope

router = APIRouter(tags=["pins"])

MAX_PINS_PER_USER = 25


class PinIn(BaseModel):
    note: str | None = Field(default=None, max_length=140)


def _claim_readable_or_403(claim_id: str, sp: ScopedPrincipal, action: str) -> dict:
    """The same three gates the claim detail route applies, in the same order."""
    claim = get_claim_in_scope(claim_id, sp.scope, sp.client_id)
    if not claim:
        audit.log_denied(sp.sub, action, "claim", claim_id)
        raise HTTPException(403, "Claim is outside your authorised organisational scope")
    if claim["restricted_access"] and not sp.has("claims_view_restricted"):
        audit.log_denied(sp.sub, f"{action}.restricted", "claim", claim_id)
        raise HTTPException(403, "Restricted-access claim")
    if sp.has("claims_own_only") and claim["submitted_by"] != sp.principal.name:
        audit.log_denied(sp.sub, f"{action}.not-own", "claim", claim_id)
        raise HTTPException(403, "You may only pin claims you submitted")
    return claim


@router.get("/pins")
def list_pins(sp: ScopedPrincipal = Depends(current_scope)):
    """
    The caller's pinned claims, newest pin first, re-filtered against live scope.

    `unavailable_count` is the number of pins that no longer resolve for this caller -
    scope changed, the claim became restricted, or it was deleted.
    """
    total = query_one(
        "SELECT COUNT(*) AS n FROM claim_pins WHERE user_sub = :s", {"s": sp.sub}
    ) or {}

    clause, params = sp.scope_clause("c")
    params["me"] = sp.sub

    restricted_sql = "" if sp.has("claims_view_restricted") else " AND c.restricted_access = 0 "
    own_sql = ""
    if sp.has("claims_own_only"):
        own_sql = " AND c.submitted_by = :own "
        params["own"] = sp.principal.name

    rows = query(
        f"""SELECT p.claim_id, p.note, p.created_at AS pinned_at,
                   c.aon_claim_id, c.status, c.sub_status, c.global_product,
                   c.carrier, c.date_of_loss, c.loss_description, c.gross_incurred,
                   c.currency_code, c.org_node
            FROM claim_pins p
            JOIN claims c ON c.aon_claim_id = p.claim_id
            WHERE p.user_sub = :me
              AND {clause}
              {restricted_sql}{own_sql}
            ORDER BY p.created_at DESC""",
        params,
    )

    return {
        "items": rows,
        "unavailable_count": max(0, int(total.get("n") or 0) - len(rows)),
        "limit": MAX_PINS_PER_USER,
    }


@router.put("/claims/{claim_id}/pin", status_code=201)
def pin_claim(
    body: PinIn,
    claim_id: str = Path(...),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Pins a claim for the caller. Idempotent - re-pinning updates the note."""
    claim = _claim_readable_or_403(claim_id, sp, "claim.pin")

    existing = query_one(
        "SELECT claim_id FROM claim_pins WHERE user_sub = :s AND claim_id = :c",
        {"s": sp.sub, "c": claim_id},
    )
    if not existing:
        count = query_one(
            "SELECT COUNT(*) AS n FROM claim_pins WHERE user_sub = :s", {"s": sp.sub}
        ) or {}
        if int(count.get("n") or 0) >= MAX_PINS_PER_USER:
            raise HTTPException(409, f"Pin limit of {MAX_PINS_PER_USER} reached")

    note = (body.note or "").strip() or None
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn = get_conn()
    if existing:
        conn.execute(
            "UPDATE claim_pins SET note = :n WHERE user_sub = :s AND claim_id = :c",
            {"n": note, "s": sp.sub, "c": claim_id},
        )
    else:
        conn.execute(
            """INSERT INTO claim_pins
                   (user_sub, claim_id, org_node, client_id, note, created_at)
               VALUES (:s, :c, :org, :client, :n, :now)""",
            {"s": sp.sub, "c": claim_id, "org": claim["org_node"],
             "client": sp.client_id, "n": note, "now": now},
        )
    conn.commit()

    audit.log(sp.sub, "claim.pin", "claim", claim_id, claim["org_node"])
    return {"claim_id": claim_id, "pinned": True, "note": note}


@router.delete("/claims/{claim_id}/pin")
def unpin_claim(
    claim_id: str = Path(...),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """
    Removes the caller's pin.

    Deliberately not gated on the claim still being readable: a user who has lost
    access to a claim must still be able to tidy up the pin they left behind, and
    deleting their own row reveals nothing about the claim.
    """
    conn = get_conn()
    conn.execute(
        "DELETE FROM claim_pins WHERE user_sub = :s AND claim_id = :c",
        {"s": sp.sub, "c": claim_id},
    )
    conn.commit()
    audit.log(sp.sub, "claim.unpin", "claim", claim_id, None)
    return {"claim_id": claim_id, "pinned": False}
