"""
In-context adjuster messaging — F9 / Epic 3.

A message thread hangs off a claim, so the two gates that guard the claim guard the
thread as well:

  1. Organisational scope (BR-001) — the claim is resolved through the same
     get_claim_in_scope helper used by the detail route, so a thread on an
     out-of-scope claim answers 403 and never confirms the claim exists.

  2. Audience — Aon-internal notes share the table with client correspondence and are
     filtered here, before the response is built. This mirrors the S-DMS document
     proxy: withholding happens server-side, and the count of withheld rows is
     reported so the interface can be honest that something was held back rather
     than pretending the thread is complete.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import get_conn, query
from ..services import audit
from ..services.sdms_proxy import get_claim_in_scope

router = APIRouter(tags=["messages"])

# Only this audience is ever sent to a client surface.
CLIENT_AUDIENCE = "client_visible"


def _resolve_claim_or_403(claim_id: str, sp: ScopedPrincipal) -> dict:
    """Shared guard: scope first, then the restricted-access flag."""
    claim = get_claim_in_scope(claim_id, sp.scope, sp.client_id)
    if not claim:
        audit.log_denied(sp.sub, "claim.messages.view", "claim", claim_id)
        raise HTTPException(403, "Claim is outside your authorised organisational scope")
    if claim["restricted_access"] and not sp.has("claims_view_restricted"):
        audit.log_denied(sp.sub, "claim.messages.view.restricted", "claim", claim_id)
        raise HTTPException(403, "Restricted-access claim")
    return claim


@router.get("/claims/{claim_id}/messages")
def list_messages(
    claim_id: str = Path(...),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Returns the client-visible thread for a claim, oldest first."""
    _resolve_claim_or_403(claim_id, sp)

    rows = query(
        """SELECT message_id, claim_id, author_name, author_role, body,
                  audience, created_at, author_sub
           FROM claim_messages
           WHERE claim_id = :c
           ORDER BY created_at ASC""",
        {"c": claim_id},
    )

    visible = [r for r in rows if r["audience"] == CLIENT_AUDIENCE]
    withheld = len(rows) - len(visible)

    # `audience` and `author_sub` are internal bookkeeping - the client gets neither.
    items = [
        {
            "message_id": r["message_id"],
            "author_name": r["author_name"],
            "author_role": r["author_role"],
            "body": r["body"],
            "created_at": r["created_at"],
            "is_own": r["author_sub"] == sp.sub,
        }
        for r in visible
    ]

    audit.log(sp.sub, "claim.messages.view", "claim", claim_id, sp.principal.org_node)
    return {"items": items, "withheld": withheld}


class NewMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/claims/{claim_id}/messages", status_code=201)
def post_message(
    payload: NewMessage,
    claim_id: str = Path(...),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """
    Adds a client message to the thread.

    A client surface can only ever author client_visible rows. The audience is set
    here from the caller's role rather than taken from the request body, so no client
    can post a message that hides itself from Aon or forge an Aon-authored reply.
    """
    claim = _resolve_claim_or_403(claim_id, sp)

    body = payload.body.strip()
    if not body:
        raise HTTPException(422, "Message body cannot be empty")

    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn = get_conn()
    conn.execute(
        """INSERT INTO claim_messages
               (message_id, claim_id, org_node, client_id, author_sub, author_name,
                author_role, body, audience, created_at)
           VALUES (:mid, :cid, :org, :client, :sub, :name, 'client', :body,
                   :aud, :now)""",
        {
            "mid": message_id,
            "cid": claim_id,
            # Stamped from the claim, not the request - keeps the row inside the
            # same scope the reader will be filtered against.
            "org": claim["org_node"],
            "client": sp.client_id,
            "sub": sp.sub,
            "name": sp.principal.name or "Client user",
            "body": body,
            "aud": CLIENT_AUDIENCE,
            "now": now,
        },
    )
    conn.commit()

    audit.log(sp.sub, "claim.messages.post", "claim", claim_id, claim["org_node"])

    return {
        "message_id": message_id,
        "author_name": sp.principal.name or "Client user",
        "author_role": "client",
        "body": body,
        "created_at": now,
        "is_own": True,
    }
