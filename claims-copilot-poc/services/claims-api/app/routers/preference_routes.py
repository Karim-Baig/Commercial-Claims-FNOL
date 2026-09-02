"""
User preferences — dashboard personalisation (F9 / Epic 1) and notification rules
(Epic 8, p. 64).

Preferences are stored server-side against the token subject, not in the browser.
That is the whole point: localStorage would personalise a device, whereas the
requirement is to personalise a *user*, so the same dashboard follows them to a
phone or a second office machine.

Both preference families share one row per user. They are stored together because
they have the same lifetime, the same owner and the same "reordering what you were
already entitled to" security property: a preference can never widen what a user can
see. Scope still comes from the JWT on every read (BR-001).

The notification rule catalogue itself lives in `services/notify.py` alongside the
engine that enforces it, so the preference surface and the write-time evaluation can
never disagree about which events and channels exist.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import get_conn, query_one
from ..services import notify

router = APIRouter(prefix="/preferences", tags=["preferences"])

# The KPI keys the dashboard knows how to render, in the order they are offered in
# the customiser. An unknown key in a stored preference is dropped on read rather
# than trusted, so removing a tile from the product does not leave a dangling
# reference in someone's saved layout.
#
# This list must stay in step with the `kpis` object built by the summary route.
KNOWN_KPIS = [
    # Shown by default - the original Figure 1 band.
    "total_gross_incurred",
    "avg_gross_incurred",
    "total_outstanding",
    "total_paid",
    "largest_claim",
    # Available to add.
    "total_claims",
    "open_claims",
    "closed_claims",
    "claims_last_30_days",
    "escalated_claims",
    "disputed_claims",
    "avg_paid_per_claim",
    "total_deductible",
    "total_sir",
    "reserve_ratio",
    "closure_rate",
    "avg_days_to_close",
]

# The five tiles a user sees before personalising anything. Everything else is
# opt-in: a dashboard that arrives with seventeen tiles is not a dashboard.
DEFAULT_VISIBLE_KPIS = [
    "total_gross_incurred",
    "avg_gross_incurred",
    "total_outstanding",
    "total_paid",
    "largest_claim",
]

DEFAULT_HIDDEN_KPIS = [k for k in KNOWN_KPIS if k not in DEFAULT_VISIBLE_KPIS]

DEFAULT_PREFS = {
    "kpi_order": list(KNOWN_KPIS),
    "kpi_hidden": list(DEFAULT_HIDDEN_KPIS),
    "notifications": notify.default_rules(),
}


def _defaults() -> dict:
    """A fresh default set. Never hand out DEFAULT_PREFS itself - its nested rule dict
    would then be shared with every caller and mutable by any of them."""
    return {
        "kpi_order": list(KNOWN_KPIS),
        "kpi_hidden": list(DEFAULT_HIDDEN_KPIS),
        "notifications": notify.default_rules(),
    }


def _load(user_sub: str) -> dict:
    row = query_one(
        "SELECT prefs_json FROM user_preferences WHERE user_sub = :s", {"s": user_sub}
    )
    if not row:
        return _defaults()
    try:
        stored = json.loads(row["prefs_json"])
    except (ValueError, TypeError):
        return _defaults()
    return _normalise(stored)


def _normalise(stored: dict) -> dict:
    """
    Reconciles a stored preference against the KPIs that currently exist.

    Unknown keys are discarded, so retiring a tile does not leave a dangling
    reference. Newly shipped tiles are appended to the order but inherit the
    product default for visibility - which means hidden. A tile that switched
    itself on across every saved dashboard the day it shipped would be a layout
    change the user never asked for.
    """
    order = [k for k in stored.get("kpi_order", []) if k in KNOWN_KPIS]
    # De-duplicate while preserving order.
    seen: set[str] = set()
    order = [k for k in order if not (k in seen or seen.add(k))]

    appended = [k for k in KNOWN_KPIS if k not in order]
    order += appended

    hidden = {k for k in stored.get("kpi_hidden", []) if k in KNOWN_KPIS}
    # Anything the caller never mentioned is new to them, so apply the default.
    hidden |= {k for k in appended if k in DEFAULT_HIDDEN_KPIS}

    return {
        "kpi_order": order,
        # Keep a stable order so `is_default` comparison and round-trips are exact.
        "kpi_hidden": [k for k in KNOWN_KPIS if k in hidden],
        "notifications": notify.normalise_rules(stored.get("notifications")),
    }


def _catalogue() -> dict:
    """The vocabulary the client needs to render the preference surfaces."""
    return {
        "known_kpis": KNOWN_KPIS,
        "notification_events": [
            {
                "event_type": ev,
                "label_token": notify.EVENT_LABEL_TOKENS[ev],
                "defaults": notify.DEFAULT_RULES[ev],
            }
            for ev in notify.EVENT_TYPES
        ],
        "notification_channels": [
            # `available` tells the UI to explain why a channel it can switch on will
            # not actually send yet, instead of silently doing nothing.
            {"channel": c, "available": notify.TRANSPORT_AVAILABLE.get(c, False)}
            for c in notify.CHANNELS
        ],
    }


@router.get("")
def get_preferences(sp: ScopedPrincipal = Depends(current_scope)):
    """Returns the caller's preferences, falling back to the defaults."""
    prefs = _load(sp.sub)
    return {**prefs, **_catalogue(), "is_default": prefs == DEFAULT_PREFS}


class PreferencePayload(BaseModel):
    kpi_order: list[str] = Field(default_factory=lambda: list(KNOWN_KPIS))
    kpi_hidden: list[str] = Field(default_factory=lambda: list(DEFAULT_HIDDEN_KPIS))
    notifications: dict[str, dict[str, bool]] = Field(default_factory=notify.default_rules)


@router.put("")
def put_preferences(
    payload: PreferencePayload,
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Upserts the caller's dashboard preferences."""
    unknown = [k for k in payload.kpi_order + payload.kpi_hidden if k not in KNOWN_KPIS]
    if unknown:
        raise HTTPException(422, f"Unknown KPI keys: {', '.join(sorted(set(unknown)))}")

    bad_events = [e for e in payload.notifications if e not in notify.DEFAULT_RULES]
    if bad_events:
        raise HTTPException(422, f"Unknown notification events: {', '.join(sorted(set(bad_events)))}")

    bad_channels = sorted({
        c for channels in payload.notifications.values()
        for c in channels if c not in notify.CHANNELS
    })
    if bad_channels:
        raise HTTPException(422, f"Unknown notification channels: {', '.join(bad_channels)}")

    # Refuse a layout that hides everything - an empty dashboard reads as a bug to
    # the user, and there is no affordance left on the page to undo it.
    if len(set(payload.kpi_hidden)) >= len(KNOWN_KPIS):
        raise HTTPException(422, "At least one KPI tile must remain visible")

    prefs = _normalise(payload.model_dump())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn = get_conn()
    existing = query_one(
        "SELECT user_sub FROM user_preferences WHERE user_sub = :s", {"s": sp.sub}
    )
    if existing:
        conn.execute(
            "UPDATE user_preferences SET prefs_json = :p, updated_at = :t WHERE user_sub = :s",
            {"p": json.dumps(prefs), "t": now, "s": sp.sub},
        )
    else:
        conn.execute(
            "INSERT INTO user_preferences (user_sub, prefs_json, client_id, updated_at) "
            "VALUES (:s, :p, :client, :t)",
            {"s": sp.sub, "p": json.dumps(prefs), "client": sp.client_id, "t": now},
        )
    conn.commit()

    return {**prefs, **_catalogue(), "updated_at": now}


@router.delete("")
def reset_preferences(sp: ScopedPrincipal = Depends(current_scope)):
    """Clears the caller's preferences, restoring the product defaults."""
    conn = get_conn()
    conn.execute("DELETE FROM user_preferences WHERE user_sub = :s", {"s": sp.sub})
    conn.commit()
    return {**DEFAULT_PREFS, **_catalogue(), "is_default": True}
