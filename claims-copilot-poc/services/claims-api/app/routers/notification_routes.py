"""
Notification routes — Epic 8 / DR-3.5.

Notifications are seeded per-persona and served scoped to the caller's JWT.
Each notification carries a claim_id deep-link that survives the PKCE round-trip (F-MER-04).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Path

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import query, query_one
from ..services import audit

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(sp: ScopedPrincipal = Depends(current_scope)):
    """
    Returns the caller's notifications, newest first.

    Filtered on `in_app`: an event the caller has switched off for the bell is still
    recorded, and still routed to whatever other channels they left on, but it does
    not appear here. See services/notify.py for why the row is kept either way.
    """
    rows = query(
        """SELECT notification_id, event_type, claim_id, title, body,
                  is_read, created_at
           FROM notifications
           WHERE recipient_sub = :sub AND in_app = 1
           ORDER BY created_at DESC
           LIMIT 50""",
        {"sub": sp.sub},
    )
    unread = sum(1 for r in rows if not r["is_read"])
    return {"items": rows, "unread_count": unread}


@router.get("/deliveries")
def list_deliveries(sp: ScopedPrincipal = Depends(current_scope)):
    """
    The caller's channel routing ledger — which channels each event was sent to and
    what happened.

    This is the surface that makes the Epic 8 gap legible: rows in `pending_provider`
    are events the rules engine correctly routed to email or SMS and which are waiting
    on a transport that this environment does not have.
    """
    rows = query(
        """SELECT d.delivery_id, d.notification_id, d.channel, d.state, d.detail,
                  d.created_at, n.event_type, n.title, n.claim_id
           FROM notification_deliveries d
           JOIN notifications n ON n.notification_id = d.notification_id
           WHERE d.recipient_sub = :sub
           ORDER BY d.created_at DESC, d.channel
           LIMIT 200""",
        {"sub": sp.sub},
    )
    pending = sum(1 for r in rows if r["state"] == "pending_provider")
    return {"items": rows, "pending_provider_count": pending}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: str = Path(...),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Marks a single notification as read."""
    notif = query_one(
        "SELECT * FROM notifications WHERE notification_id=:n AND recipient_sub=:s",
        {"n": notification_id, "s": sp.sub},
    )
    if not notif:
        from fastapi import HTTPException
        raise HTTPException(404, "Notification not found")

    from ..db import get_conn
    conn = get_conn()
    conn.execute(
        "UPDATE notifications SET is_read=1 WHERE notification_id=:n",
        {"n": notification_id},
    )
    conn.commit()
    return {"notification_id": notification_id, "is_read": True}


@router.patch("/read-all")
def mark_all_read(sp: ScopedPrincipal = Depends(current_scope)):
    """Marks all of the caller's notifications as read."""
    from ..db import get_conn
    conn = get_conn()
    conn.execute(
        "UPDATE notifications SET is_read=1 WHERE recipient_sub=:s",
        {"s": sp.sub},
    )
    conn.commit()
    return {"marked_read": True}
