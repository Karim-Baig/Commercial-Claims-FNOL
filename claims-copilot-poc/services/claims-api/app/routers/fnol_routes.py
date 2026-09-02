"""
FNOL intake routes.

Implements the resilient outbox pattern (NFR-37): the submission is written to
fnol_outbox before attempting Claims Copilot (Appian). If Appian is unavailable,
the client still receives a receipt. A background worker (not in POC scope)
reconciles queued rows and issues real aon_claim_ids.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import get_conn, query, query_one
from ..services import audit, notify

router = APIRouter(tags=["fnol"])


def _client_admins_above(org_node: str | None, exclude_sub: str) -> list[dict]:
    """
    Client administrators whose scope contains `org_node`.

    A new intake is the Risk Manager's business even when a site manager raised it, so
    submission notifies upward. `instr(path, path) = 1` is the prefix test that BR-001
    already uses for downward inheritance, read in the other direction.
    """
    if not org_node:
        return []
    return query(
        """SELECT p.persona_id, p.name
           FROM personas p
           JOIN org_nodes pn ON pn.org_node = p.org_node
           JOIN org_nodes cn ON cn.org_node = :org
           WHERE p.org_node IS NOT NULL
             AND instr(p.groups_csv, 'claims_client_admin') > 0
             AND instr(cn.path, pn.path) = 1
             AND ('poc|persona-' || p.persona_id) <> :me""",
        {"org": org_node, "me": exclude_sub},
    )


# ── Policies (Step 2 source) ───────────────────────────────────────────────────

@router.get("/policies")
def list_policies(
    sp: ScopedPrincipal = Depends(current_scope),
    site: str | None = Query(None),
    date_of_loss: str | None = Query(None),
):
    """
    Returns policies active for FNOL scoped to the caller's org hierarchy.

    Site and date_of_loss narrow the results (Figure 5: site + date drive Step 2).
    Only policies with active_for_fnol = 1 appear.
    """
    from ..db import expand_in

    # Scope must contain the requested site (BR-001).
    if site and site not in sp.scope:
        raise HTTPException(403, "Requested site is outside your authorised scope")

    # Policies are placed at location / corporate level, not at individual sites.
    # When the wizard has a specific site selected, expand the lookup to include all
    # ancestor nodes so the correct policy is found regardless of which level it was
    # placed at (same instr prefix-test used by BR-001 for descendant checks, reversed).
    if site:
        site_row = query_one("SELECT path FROM org_nodes WHERE org_node = :n", {"n": site})
        if site_row:
            ancestor_rows = query(
                "SELECT org_node FROM org_nodes WHERE instr(:path, path) = 1",
                {"path": site_row["path"]},
            )
            nodes = [r["org_node"] for r in ancestor_rows]
        else:
            nodes = [site]
    else:
        nodes = list(sp.scope)
    clause, params = expand_in("p", nodes)

    # Node scope alone is correct within a tenant. The tenant predicate is added so a
    # policy mis-stamped against another client cannot surface on an FNOL form.
    tenant_sql, tenant_params = sp.tenant_clause()
    params.update(tenant_params)

    where = [tenant_sql, f"org_node IN {clause}", "active_for_fnol = 1"]

    # Filter by date_of_loss falling within the policy period when provided.
    if date_of_loss:
        where.append(
            "(effective_date IS NULL OR effective_date <= :dol)"
            " AND (expiration_date IS NULL OR expiration_date >= :dol)"
        )
        params["dol"] = date_of_loss

    rows = query(
        f"""SELECT policy_id, org_node, carrier_name, carrier_policy_number,
                   cover_number, agreement_version, product_line,
                   effective_date, expiration_date,
                   aon_contact_name, aon_contact_email
            FROM policies
            WHERE {' AND '.join(where)}
            ORDER BY product_line, effective_date DESC""",
        params,
    )

    audit.log(sp.sub, "policy.list", "policy", None, sp.principal.org_node)
    return {"policies": rows, "site": site, "date_of_loss": date_of_loss}


# ── FNOL submission (resilient outbox) ────────────────────────────────────────

class FnolContact(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    can_view: bool = True
    can_modify: bool = False
    include_on_emails: bool = True


class FnolSubmission(BaseModel):
    site_org_node: str
    date_of_loss: str
    claim_type: str = "Claim"
    policy_id: str | None = None
    product_line: str | None = None
    loss_description: str | None = None
    cause_of_loss: str | None = None
    named_insured: str | None = None
    loss_country: str | None = None
    client_claim_ref: str | None = None
    dynamic_fields: dict = {}
    contacts: list[FnolContact] = []
    document_ids: list[str] = []


@router.post("/fnol", status_code=202)
def submit_fnol(
    payload: FnolSubmission,
    idempotency_key: str = Header(alias="Idempotency-Key", default=""),
    sp: ScopedPrincipal = Depends(current_scope),
):
    """
    Resilient FNOL submission — durable outbox pattern (NFR-37).

    The record is written to fnol_outbox BEFORE any attempt to reach Claims Copilot.
    The client always receives a receipt. A reconciliation worker issues the real
    aon_claim_id and fires a notification once Appian acknowledges.

    Idempotency-Key makes retries safe (e.g. from a flaky mobile connection on Step 5).
    """
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")

    # BR-005: site must be within the caller's authorised scope.
    if payload.site_org_node not in sp.scope:
        audit.log_denied(sp.sub, "fnol.submit", "fnol", None)
        raise HTTPException(403, "Site is outside your authorised organisational scope (BR-005)")

    # Replay protection — safe retries.
    idem = idempotency_key or str(uuid.uuid4())
    existing = query_one(
        "SELECT submission_id, aon_claim_id, state FROM fnol_outbox WHERE idempotency_key = :k",
        {"k": idem},
    )
    if existing:
        return {
            "submission_id": existing["submission_id"],
            "aon_claim_id": existing["aon_claim_id"],
            "state": existing["state"],
            "replayed": True,
        }

    import json

    submission_id = f"SUB-{uuid.uuid4().hex[:12].upper()}"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    from ..db import get_conn
    conn = get_conn()
    conn.execute(
        """INSERT INTO fnol_outbox
               (submission_id, idempotency_key, org_node, client_id, payload_json, state,
                attempts, created_at)
           VALUES (:sid, :ikey, :org, :client, :payload, 'queued', 0, :now)""",
        {
            "sid": submission_id,
            "ikey": idem,
            # BR-006: stamp the submission with the caller's org_node from the JWT.
            "org": payload.site_org_node,
            "client": sp.client_id,
            "payload": json.dumps(payload.dict()),
            "now": now,
        },
    )
    conn.commit()

    audit.log(sp.sub, "fnol.submit", "fnol", submission_id, payload.site_org_node)

    # Attempt Claims Copilot (Appian). If it is unavailable the client is unaffected.
    aon_claim_id = _try_claims_copilot(submission_id, payload, sp)

    # Epic 8: the rules engine runs here, at write time, against each recipient's own
    # preferences. Notifying is never allowed to fail the submission - the claim is
    # already durably recorded, and losing it over a notification would invert the
    # whole point of the outbox pattern.
    def _notify(recipient: str, event: str, title: str, body: str) -> None:
        try:
            notify.emit(
                recipient_sub=recipient, event_type=event, title=title, body=body,
                claim_id=aon_claim_id, org_node=payload.site_org_node,
            )
        except Exception:  # noqa: BLE001 - deliberately swallowed, see above
            logging.getLogger(__name__).exception("notification emit failed")

    submitter = sp.principal.name or "A colleague"

    if aon_claim_id:
        conn.execute(
            "UPDATE fnol_outbox SET state='sent', aon_claim_id=:cid, sent_at=:now, attempts=1 WHERE submission_id=:sid",
            {"cid": aon_claim_id, "now": now, "sid": submission_id},
        )
        conn.commit()

        _notify(
            sp.sub, "fnol_acknowledged",
            f"Claim {aon_claim_id} registered",
            f"Your claim has been registered. Aon Claim ID: {aon_claim_id}.",
        )
        for admin in _client_admins_above(payload.site_org_node, sp.sub):
            _notify(
                f"poc|persona-{admin['persona_id']}", "fnol_queued",
                "New FNOL submitted",
                f"{submitter} has submitted a new "
                f"{payload.product_line or 'claim'} at {payload.site_org_node}.",
            )

        return {
            "submission_id": submission_id,
            "aon_claim_id": aon_claim_id,
            "state": "acknowledged",
            "message": "Your claim has been registered successfully.",
        }

    # Appian unavailable — client still gets a receipt.
    _notify(
        sp.sub, "fnol_queued",
        "Claim received and queued",
        "Your claim has been securely recorded. An Aon Claim ID will follow shortly.",
    )

    return {
        "submission_id": submission_id,
        "aon_claim_id": None,
        "state": "queued",
        "message": (
            "Your claim has been received and securely recorded. "
            "Your Aon Claim ID will be emailed to you shortly."
        ),
    }


def _try_claims_copilot(
    submission_id: str, payload: FnolSubmission, sp: ScopedPrincipal
) -> str | None:
    """
    POC stub — simulates the Claims Copilot (Appian) integration.

    In production this makes an authenticated HTTP call to the Appian API with a
    3-second timeout. On Timeout or ServiceUnavailable it returns None; the outbox
    worker retries. Returning None here demonstrates the resilient path without
    needing a real Appian environment.
    """
    import random

    # Simulate Appian being available 85% of the time in the POC.
    if random.random() < 0.85:
        claim_id = f"CLM-{uuid.uuid4().hex[:4].upper()}"
        return claim_id
    return None


@router.get("/fnol/outbox")
def list_outbox(sp: ScopedPrincipal = Depends(current_scope)):
    """Returns the caller's queued FNOL submissions (demo / admin surface)."""
    if not sp.has("claims_client_admin"):
        raise HTTPException(403, "Client Admin privilege required")
    rows = query(
        "SELECT submission_id, org_node, state, aon_claim_id, created_at, sent_at "
        "FROM fnol_outbox ORDER BY created_at DESC LIMIT 50"
    )
    return {"items": rows}


# ── Cross-device draft continuity (F9 / Epic 5) ────────────────────────────────
#
# Wizard state is held server-side against the token subject, which is what makes a
# draft resumable from a different device. It deliberately does not live in the
# claims table: a half-finished intake has no status, no product and no date of
# loss, so writing it there would mean filling NOT NULL columns with placeholder
# values and then having to tell real claims apart from those placeholders.
#
# Drafts are owned by their author and are not shared across an org node. Two managers
# at the same site should not see each other's unfinished intake, so every read and
# write is filtered on owner_sub - or on an explicit delegation (Epic 2, below).


class DraftPayload(BaseModel):
    """The wizard's in-progress state. Shape is intentionally open."""
    site_org_node: str | None = None
    label: str | None = None
    current_step: int = 1
    last_device: str | None = None
    values: dict = {}


def _draft_accessible_or_404(draft_id: str, sp: ScopedPrincipal) -> dict:
    """
    A draft the caller may read and edit: their own, or one delegated to them.

    Delegation is explicit and single-target. It is not derived from scope, because
    "my manager can see my half-finished claim" is not something org hierarchy should
    silently imply - the owner has to name the delegate.
    """
    row = query_one(
        """SELECT * FROM fnol_drafts
           WHERE draft_id = :d AND (owner_sub = :s OR delegate_sub = :s)""",
        {"d": draft_id, "s": sp.sub},
    )
    if not row:
        # 404 rather than 403: a draft belonging to someone else is not something we
        # confirm the existence of, and the caller has no way to act on it either way.
        raise HTTPException(404, "Draft not found")
    return row


def _draft_owned_or_404(draft_id: str, sp: ScopedPrincipal) -> dict:
    """Owner-only access. Delegating and deleting are not a delegate's to make."""
    row = query_one(
        "SELECT * FROM fnol_drafts WHERE draft_id = :d AND owner_sub = :s",
        {"d": draft_id, "s": sp.sub},
    )
    if not row:
        raise HTTPException(404, "Draft not found")
    return row


def _as_draft(row: dict, include_payload: bool = False, viewer_sub: str = "") -> dict:
    import json as _json

    out = {
        "draft_id": row["draft_id"],
        "site_org_node": row["site_org_node"],
        "label": row["label"],
        "current_step": row["current_step"],
        "last_device": row["last_device"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "owned_by_me": row["owner_sub"] == viewer_sub,
        "delegate_name": row["delegate_name"],
        "delegated_by_name": row["delegated_by_name"],
        "delegated_at": row["delegated_at"],
    }
    if include_payload:
        try:
            out["values"] = _json.loads(row["payload_json"])
        except (ValueError, TypeError):
            out["values"] = {}
    return out


@router.get("/fnol/drafts")
def list_drafts(sp: ScopedPrincipal = Depends(current_scope)):
    """The caller's own in-progress drafts plus any delegated to them, newest first."""
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")

    rows = query(
        """SELECT * FROM fnol_drafts
           WHERE owner_sub = :s OR delegate_sub = :s
           ORDER BY updated_at DESC
           LIMIT 25""",
        {"s": sp.sub},
    )
    return {"items": [_as_draft(r, viewer_sub=sp.sub) for r in rows]}


@router.get("/fnol/drafts/{draft_id}")
def get_draft(draft_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    """Returns a single draft including its wizard state, for resuming."""
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")
    row = _draft_accessible_or_404(draft_id, sp)
    audit.log(sp.sub, "fnol.draft.resume", "fnol_draft", draft_id, row["org_node"])
    return _as_draft(row, include_payload=True, viewer_sub=sp.sub)


@router.put("/fnol/drafts/{draft_id}")
def upsert_draft(
    draft_id: str,
    payload: DraftPayload,
    sp: ScopedPrincipal = Depends(current_scope),
):
    """
    Creates or replaces a draft. The client generates the draft_id so an autosave
    is idempotent - repeated saves of the same wizard session overwrite one row
    rather than accumulating a new draft per keystroke.
    """
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")

    # A draft may only be parked against a site the caller is authorised for (BR-005),
    # checked on save so an out-of-scope value cannot be smuggled in and then resumed.
    if payload.site_org_node and payload.site_org_node not in sp.scope:
        audit.log_denied(sp.sub, "fnol.draft.save", "fnol_draft", draft_id)
        raise HTTPException(403, "Site is outside your authorised organisational scope (BR-005)")

    import json as _json

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # A delegate may edit the draft they were given (Epic 2), so an existing row counts
    # as the caller's if they are either the owner or the delegate.
    existing = query_one(
        """SELECT draft_id, created_at FROM fnol_drafts
           WHERE draft_id = :d AND (owner_sub = :s OR delegate_sub = :s)""",
        {"d": draft_id, "s": sp.sub},
    )

    # Guard against a caller claiming a draft_id that belongs to somebody else.
    collision = query_one(
        "SELECT owner_sub, delegate_sub FROM fnol_drafts WHERE draft_id = :d",
        {"d": draft_id},
    )
    if collision and sp.sub not in (collision["owner_sub"], collision["delegate_sub"]):
        raise HTTPException(409, "Draft identifier is already in use")

    params = {
        "d": draft_id,
        "s": sp.sub,
        "org": sp.principal.org_node,
        # Tenant from the resolved scope, not the request body.
        "client": sp.client_id,
        "site": payload.site_org_node,
        "label": (payload.label or "").strip() or None,
        "payload": _json.dumps(payload.values),
        "step": max(1, payload.current_step),
        "device": payload.last_device,
        "now": now,
    }

    conn = get_conn()
    if existing:
        conn.execute(
            """UPDATE fnol_drafts
                  SET site_org_node = :site, label = :label, payload_json = :payload,
                      current_step = :step, last_device = :device, updated_at = :now
                WHERE draft_id = :d AND (owner_sub = :s OR delegate_sub = :s)""",
            params,
        )
    else:
        conn.execute(
            """INSERT INTO fnol_drafts
                   (draft_id, owner_sub, org_node, client_id, site_org_node, label,
                    payload_json, current_step, last_device, created_at, updated_at)
               VALUES (:d, :s, :org, :client, :site, :label, :payload, :step, :device,
                       :now, :now)""",
            params,
        )
    conn.commit()

    audit.log(sp.sub, "fnol.draft.save", "fnol_draft", draft_id, sp.principal.org_node)

    row = query_one("SELECT * FROM fnol_drafts WHERE draft_id = :d", {"d": draft_id})
    return (
        _as_draft(row, include_payload=False, viewer_sub=sp.sub)
        if row else {"draft_id": draft_id}
    )


# ── FNOL delegation (Epic 2) ──────────────────────────────────────────────────
#
# Epic 2 asks for "FNOL delegation and multi-user co-authoring". Delegation is modelled
# as a grant on the draft rather than a transfer of it:
#
#   * the owner stays the owner, so the audit trail still shows who began the intake;
#   * exactly one delegate at a time - a list would need a merge story for concurrent
#     edits, and the honest version of that is a locking or CRDT design, not a column;
#   * the delegate must already hold claims_fnol and must sit inside the owner's
#     authorised scope, so delegation can never widen who can file against a site.
#
# Co-authoring is therefore sequential rather than simultaneous: both parties can open
# and save the same draft, and `last_device` shows who touched it last.


class DelegateIn(BaseModel):
    delegate_sub: str


@router.get("/fnol/delegates")
def list_delegates(sp: ScopedPrincipal = Depends(current_scope)):
    """
    Colleagues the caller may delegate a draft to.

    Restricted to users inside the caller's own scope who already hold the FNOL
    privilege, so the picker cannot offer someone the grant would have to elevate.
    """
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")

    from ..db import expand_in
    clause, params = sp.scope_clause()
    params["me"] = sp.sub

    rows = query(
        f"""SELECT persona_id, name, example_role, org_node
            FROM personas
            WHERE {clause}
              AND instr(groups_csv, 'claims_fnol') > 0
              AND ('poc|persona-' || persona_id) <> :me
            ORDER BY name""",
        params,
    )
    return {
        "items": [
            {
                "sub": f"poc|persona-{r['persona_id']}",
                "name": r["name"],
                "role": r["example_role"],
                "org_node": r["org_node"],
            }
            for r in rows
        ]
    }


@router.post("/fnol/drafts/{draft_id}/delegate")
def delegate_draft(
    draft_id: str,
    body: DelegateIn,
    sp: ScopedPrincipal = Depends(current_scope),
):
    """Grants a colleague edit and submit rights on a draft the caller owns."""
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")

    row = _draft_owned_or_404(draft_id, sp)

    if body.delegate_sub == sp.sub:
        raise HTTPException(422, "A draft cannot be delegated to its own owner")

    # Re-derive the candidate from scope rather than trusting the posted sub: this is
    # the point where a caller could otherwise hand their draft to an arbitrary subject.
    candidates = {d["sub"]: d for d in list_delegates(sp)["items"]}
    delegate = candidates.get(body.delegate_sub)
    if not delegate:
        audit.log_denied(sp.sub, "fnol.draft.delegate", "fnol_draft", draft_id)
        raise HTTPException(403, "Delegate is not an eligible user within your scope")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn = get_conn()
    conn.execute(
        """UPDATE fnol_drafts
              SET delegate_sub = :ds, delegate_name = :dn,
                  delegated_by_name = :bn, delegated_at = :now
            WHERE draft_id = :d AND owner_sub = :s""",
        {
            "ds": delegate["sub"], "dn": delegate["name"],
            "bn": sp.principal.name, "now": now, "d": draft_id, "s": sp.sub,
        },
    )
    conn.commit()

    audit.log(sp.sub, "fnol.draft.delegate", "fnol_draft", draft_id, row["org_node"])

    try:
        notify.emit(
            recipient_sub=delegate["sub"], event_type="fnol_delegated",
            title="An FNOL draft was shared with you",
            body=f"{sp.principal.name} has asked you to complete "
                 f"\"{row['label'] or 'an unnamed draft'}\".",
            org_node=row["org_node"],
        )
    except Exception:  # noqa: BLE001 - the grant is already committed
        logging.getLogger(__name__).exception("delegation notification failed")

    fresh = query_one("SELECT * FROM fnol_drafts WHERE draft_id = :d", {"d": draft_id})
    return _as_draft(fresh, viewer_sub=sp.sub)


@router.delete("/fnol/drafts/{draft_id}/delegate")
def revoke_delegate(draft_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    """Withdraws a delegation. Owner only - a delegate cannot un-delegate themselves."""
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")
    row = _draft_owned_or_404(draft_id, sp)

    conn = get_conn()
    conn.execute(
        """UPDATE fnol_drafts
              SET delegate_sub = NULL, delegate_name = NULL,
                  delegated_by_name = NULL, delegated_at = NULL
            WHERE draft_id = :d AND owner_sub = :s""",
        {"d": draft_id, "s": sp.sub},
    )
    conn.commit()
    audit.log(sp.sub, "fnol.draft.delegate.revoke", "fnol_draft", draft_id, row["org_node"])

    fresh = query_one("SELECT * FROM fnol_drafts WHERE draft_id = :d", {"d": draft_id})
    return _as_draft(fresh, viewer_sub=sp.sub)


@router.delete("/fnol/drafts/{draft_id}", status_code=200)
def delete_draft(draft_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    """Discards a draft the caller owns. A delegate may edit but not destroy."""
    if not sp.has("claims_fnol"):
        raise HTTPException(403, "FNOL creation privilege not held (BR-005)")
    _draft_owned_or_404(draft_id, sp)

    conn = get_conn()
    conn.execute(
        "DELETE FROM fnol_drafts WHERE draft_id = :d AND owner_sub = :s",
        {"d": draft_id, "s": sp.sub},
    )
    conn.commit()
    audit.log(sp.sub, "fnol.draft.delete", "fnol_draft", draft_id, sp.principal.org_node)
    return {"draft_id": draft_id, "deleted": True}
