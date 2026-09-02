"""Audit trail (NFR-04). Every denial is recorded, not silently swallowed."""
from datetime import datetime, timezone

from ..db import execute


def log(
    actor_sub: str,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    org_node: str | None = None,
    outcome: str = "allowed",
) -> None:
    execute(
        """
        INSERT INTO audit_log (actor_sub, action, resource_type, resource_id,
                               org_node, outcome, ts)
        VALUES (:a, :ac, :rt, :ri, :on, :oc, :ts)
        """,
        {
            "a": actor_sub, "ac": action, "rt": resource_type, "ri": resource_id,
            "on": org_node, "oc": outcome,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    )


def log_denied(actor_sub: str, action: str, resource_type: str, resource_id: str) -> None:
    log(actor_sub, action, resource_type, resource_id, outcome="denied")
