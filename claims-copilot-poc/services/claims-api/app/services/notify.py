"""
Notification rules engine — Epic 8 (p. 64).

Epic 8 asks for "configurable notification rules by event type" and "email and SMS
channel preferences". Both halves are implemented here; what is deliberately *not*
implemented is the sending itself.

Why sending is out
------------------
An email or SMS transport is not a code problem, it is a set of decisions this POC
cannot make on the client's behalf: which provider, which sending domain and DKIM
records, which consent and opt-out register, and which jurisdiction's marketing rules
apply to a claims notification. Wiring a provider SDK in without those would produce a
demo that appears to send and does not, which is worse than an honest gap.

So the rules engine runs for real. Every channel it selects is written to
`notification_deliveries` with the outcome, which means the routing decision is
auditable today and production only has to add a worker that drains that table.

Design notes
------------
* The event row in `notifications` is always written. `in_app` controls whether the
  bell shows it. A preference must not be able to erase the record that an event
  happened - that would make the audit trail depend on a user setting.
* Rules are resolved per recipient at write time, not at read time. A preference
  change therefore affects future events only, which is what a user expects: turning
  email off does not retroactively un-send yesterday's mail.
* Unknown events and channels in a stored preference are dropped on read, so retiring
  an event type cannot leave a dangling rule behind.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from ..db import get_conn, query_one

# ── channels ──────────────────────────────────────────────────────────────────
CHANNELS = ("in_app", "email", "sms")

# Which channels actually have a transport in this environment. Flipping email or sms
# to True is the entire production swap for this module - the rules engine, the
# preference surface and the delivery ledger above it do not change.
TRANSPORT_AVAILABLE = {"in_app": True, "email": False, "sms": False}

NO_TRANSPORT_DETAIL = {
    "email": "No email transport configured in this environment",
    "sms": "No SMS transport configured in this environment",
}


# ── event catalogue ───────────────────────────────────────────────────────────
# (event_type, label_token, in_app, email, sms)
#
# SMS defaults to off on every event on purpose. It costs money per message, it needs a
# verified mobile number, and in several of the client's jurisdictions it needs recorded
# consent - so it is opt-in rather than something a user discovers after the fact.
EVENT_DEFAULTS: list[tuple[str, str, bool, bool, bool]] = [
    ("fnol_acknowledged", "notif.event.fnol_acknowledged", True, True, False),
    ("fnol_queued", "notif.event.fnol_queued", True, False, False),
    ("reserve_set", "notif.event.reserve_set", True, True, False),
    ("status_changed", "notif.event.status_changed", True, False, False),
    ("document_requested", "notif.event.document_requested", True, True, False),
    ("claim_closed", "notif.event.claim_closed", True, True, False),
    ("message_received", "notif.event.message_received", True, True, False),
    ("fnol_delegated", "notif.event.fnol_delegated", True, True, False),
]

EVENT_TYPES = [e[0] for e in EVENT_DEFAULTS]
EVENT_LABEL_TOKENS = {e[0]: e[1] for e in EVENT_DEFAULTS}

DEFAULT_RULES: dict[str, dict[str, bool]] = {
    e[0]: {"in_app": e[2], "email": e[3], "sms": e[4]} for e in EVENT_DEFAULTS
}


def default_rules() -> dict[str, dict[str, bool]]:
    """A fresh copy, so a caller mutating the result cannot poison the defaults."""
    return {ev: dict(ch) for ev, ch in DEFAULT_RULES.items()}


def normalise_rules(stored: object) -> dict[str, dict[str, bool]]:
    """
    Reconciles a stored rule set against the events and channels that exist now.

    Anything unrecognised is discarded and anything unmentioned inherits the product
    default, so a stored preference can never widen the channel list or resurrect a
    retired event type.
    """
    rules = default_rules()
    if not isinstance(stored, dict):
        return rules

    for event, channels in stored.items():
        if event not in rules or not isinstance(channels, dict):
            continue
        for channel, enabled in channels.items():
            if channel in CHANNELS:
                rules[event][channel] = bool(enabled)

    return rules


def resolve_rules(user_sub: str) -> dict[str, dict[str, bool]]:
    """The recipient's effective rules, falling back to the defaults."""
    row = query_one(
        "SELECT prefs_json FROM user_preferences WHERE user_sub = :s", {"s": user_sub}
    )
    if not row:
        return default_rules()
    try:
        stored = json.loads(row["prefs_json"])
    except (ValueError, TypeError):
        return default_rules()
    return normalise_rules((stored or {}).get("notifications"))


# ── emission ──────────────────────────────────────────────────────────────────

def emit(
    recipient_sub: str,
    event_type: str,
    title: str,
    body: str | None = None,
    claim_id: str | None = None,
    org_node: str | None = None,
) -> dict:
    """
    Records an event against a recipient, routed by that recipient's own rules.

    Returns the notification id and the per-channel outcome, so a caller (and the
    tests) can assert on the routing decision rather than having to infer it.
    """
    if event_type not in DEFAULT_RULES:
        raise ValueError(f"Unknown notification event type: {event_type}")

    rules = resolve_rules(recipient_sub)[event_type]
    notification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    in_app = bool(rules.get("in_app"))

    conn = get_conn()
    conn.execute(
        """INSERT INTO notifications
               (notification_id, recipient_sub, org_node, event_type, claim_id,
                title, body, is_read, in_app, created_at)
           VALUES (:nid, :sub, :org, :ev, :cid, :title, :body, 0, :in_app, :now)""",
        {
            "nid": notification_id, "sub": recipient_sub, "org": org_node,
            "ev": event_type, "cid": claim_id, "title": title, "body": body,
            "in_app": 1 if in_app else 0, "now": now,
        },
    )

    outcomes: dict[str, str] = {}
    for channel in CHANNELS:
        if not rules.get(channel):
            outcomes[channel] = "off"
            continue

        if TRANSPORT_AVAILABLE.get(channel):
            state, detail = "delivered", None
        else:
            # Selected by the rules but undeliverable here. Recorded rather than
            # dropped, so the gap is visible instead of looking like a bug.
            state, detail = "pending_provider", NO_TRANSPORT_DETAIL.get(channel)

        outcomes[channel] = state
        conn.execute(
            """INSERT INTO notification_deliveries
                   (delivery_id, notification_id, recipient_sub, channel,
                    state, detail, created_at)
               VALUES (:did, :nid, :sub, :ch, :state, :detail, :now)""",
            {
                "did": str(uuid.uuid4()), "nid": notification_id,
                "sub": recipient_sub, "ch": channel, "state": state,
                "detail": detail, "now": now,
            },
        )

    conn.commit()
    return {
        "notification_id": notification_id,
        "event_type": event_type,
        "in_app": in_app,
        "channels": outcomes,
    }
