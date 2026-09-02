"""
Claims data surfaces.

Every route depends on current_scope, so the organisational filter (BR-001 / F-CC-07)
cannot be skipped. Scope is never accepted from the request — with one exception:
the optional `org_node` query param on /summary and /claims allows a caller to
narrow their view to a sub-node they are already authorised for. The narrowing is
validated by ScopedPrincipal.narrow(), which refuses any node not already in the
JWT-derived scope, so the result is always a strict subset of what the token permits.
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import expand_in, query, query_one
from ..services import audit
from ..services.sdms_proxy import get_claim_in_scope, list_claim_documents

router = APIRouter(tags=["claims"])

SORTABLE = {
    "aon_claim_id", "status", "sub_status", "claim_type", "global_product",
    "global_product_category", "carrier", "date_of_loss", "gross_incurred",
    "total_paid", "total_outstanding", "submitted_at", "named_insured",
    "carrier_policy_number", "loss_description", "submitted_by", "aon_claim_lead",
    "assigned_team", "aon_office", "region", "country", "name_of_loss",
    "date_last_updated", "claim_closure_date", "date_reported_to_aon",
}


def _own_only_clause(sp: ScopedPrincipal) -> tuple[str, dict]:
    """Persona 6 sees only what they submitted themselves."""
    if sp.has("claims_own_only"):
        return " AND submitted_by = :own ", {"own": sp.principal.name}
    return "", {}


def _restricted_clause(sp: ScopedPrincipal) -> str:
    if sp.has("claims_view_restricted"):
        return ""
    return " AND restricted_access = 0 "


@router.get("/summary")
def summary(
    sp: ScopedPrincipal = Depends(current_scope),
    org_node: str | None = Query(None),
):
    if org_node:
        sp = sp.narrow(org_node)
    clause, sp_params = sp.scope_clause()
    own_sql, own_params = _own_only_clause(sp)
    params = {**sp_params, **own_params}

    base = f"FROM claims WHERE {clause} AND is_draft = 0 {_restricted_clause(sp)}{own_sql}"

    agg = query_one(
        f"""SELECT COUNT(*) AS n,
                   COALESCE(SUM(gross_incurred), 0)         AS incurred,
                   COALESCE(SUM(total_paid), 0)             AS paid,
                   COALESCE(SUM(total_outstanding), 0)      AS outstanding,
                   COALESCE(MAX(gross_incurred), 0)         AS largest,
                   COALESCE(SUM(applicable_deductible), 0)  AS deductible,
                   COALESCE(SUM(sir_amount), 0)             AS sir,
                   SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END)  AS closed_n,
                   SUM(CASE WHEN status <> 'Closed' THEN 1 ELSE 0 END) AS open_n,
                   SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END)      AS escalated_n,
                   SUM(CASE WHEN disputed_claim = 1 THEN 1 ELSE 0 END) AS disputed_n
            {base}""",
        params,
    ) or {}

    # ISO dates compare correctly as strings, which keeps this portable to MySQL
    # rather than reaching for a SQLite-only date function.
    from datetime import date as _date, timedelta as _timedelta

    cutoff = (_date.today() - _timedelta(days=30)).isoformat()
    recent_agg = query_one(
        f"SELECT COUNT(*) AS n {base} AND date_reported_to_aon >= :cutoff",
        {**params, "cutoff": cutoff},
    ) or {}

    # Average days to close is computed in Python from the two dates rather than in
    # SQL, because julianday()/DATEDIFF() differ between SQLite and MySQL and this
    # is the only place the service needs date arithmetic.
    closed_rows = query(
        f"""SELECT date_of_loss, claim_closure_date {base}
            AND status = 'Closed' AND claim_closure_date IS NOT NULL""",
        params,
    )
    spans: list[int] = []
    for row in closed_rows:
        try:
            opened = _date.fromisoformat(str(row["date_of_loss"])[:10])
            closed = _date.fromisoformat(str(row["claim_closure_date"])[:10])
        except (TypeError, ValueError):
            continue
        if closed >= opened:
            spans.append((closed - opened).days)
    avg_days_to_close = sum(spans) / len(spans) if spans else 0

    largest_row = query_one(
        f"""SELECT aon_claim_id, gross_incurred, currency_code
            {base} ORDER BY gross_incurred DESC LIMIT 1""",
        params,
    )

    effective_node_id = org_node or sp.principal.org_node
    node = query_one(
        "SELECT display_name FROM org_nodes WHERE org_node = :n",
        {"n": effective_node_id},
    ) or {"display_name": effective_node_id}

    currency = (largest_row or {}).get("currency_code") or "USD"
    n = int(agg.get("n") or 0)

    recent = query(
        f"""SELECT aon_claim_id, org_node, status, sub_status, claim_type,
                   global_product, carrier, carrier_policy_number, date_of_loss,
                   loss_description, named_insured, submitted_by, submitted_at,
                   gross_incurred, currency_code
            {base} ORDER BY date_of_loss DESC LIMIT 5""",
        params,
    )

    audit.log(sp.sub, "summary.view", "summary", org_node or sp.principal.org_node, sp.principal.org_node)

    # Year-on-year values are illustrative in the POC; the shape matches Figure 1.
    #
    # Each KPI carries its own unit and direction-of-adversity, so the dashboard can
    # render any of them without knowing what they mean. Adding a tile is then a
    # change here plus one `kpi.<key>` translation - no frontend edit.
    def kpi(
        value: float,
        yoy: float | None = None,
        claim_id: str | None = None,
        unit: str = "money",
        rise_is_adverse: bool = False,
    ):
        out: dict = {
            "value": round(value, 2),
            "currency": currency,
            "unit": unit,
            "rise_is_adverse": rise_is_adverse,
        }
        if yoy is not None:
            out["yoy_pct"] = yoy
        if claim_id:
            out["aon_claim_id"] = claim_id
        return out

    incurred = float(agg.get("incurred") or 0)
    paid = float(agg.get("paid") or 0)
    outstanding = float(agg.get("outstanding") or 0)
    closed_n = int(agg.get("closed_n") or 0)

    return {
        "org_node": effective_node_id,
        "org_display_name": node["display_name"],
        "scope_node_count": len(sp.scope),
        "claim_count": n,
        "kpis": {
            # ── Shown by default (the original Figure 1 band) ──
            "total_gross_incurred": kpi(incurred, 12.4, rise_is_adverse=True),
            "avg_gross_incurred": kpi(incurred / n if n else 0, -3.1, rise_is_adverse=True),
            "total_outstanding": kpi(outstanding, 8.0, rise_is_adverse=True),
            "total_paid": kpi(paid, 15.2),
            "largest_claim": kpi(
                (largest_row or {}).get("gross_incurred") or 0,
                None,
                (largest_row or {}).get("aon_claim_id"),
            ),

            # ── Available to add, hidden by default ──
            "open_claims": kpi(
                float(agg.get("open_n") or 0), 6.5, unit="count", rise_is_adverse=True
            ),
            "closed_claims": kpi(float(closed_n), 9.8, unit="count"),
            "total_claims": kpi(float(n), 4.2, unit="count"),
            "claims_last_30_days": kpi(
                float(recent_agg.get("n") or 0), unit="count", rise_is_adverse=True
            ),
            "escalated_claims": kpi(
                float(agg.get("escalated_n") or 0), unit="count", rise_is_adverse=True
            ),
            "disputed_claims": kpi(
                float(agg.get("disputed_n") or 0), unit="count", rise_is_adverse=True
            ),
            "total_deductible": kpi(float(agg.get("deductible") or 0), unit="money"),
            "total_sir": kpi(float(agg.get("sir") or 0), unit="money"),
            "avg_paid_per_claim": kpi(paid / n if n else 0, 7.4, unit="money"),
            # Outstanding as a share of incurred: how much of the book is unsettled.
            "reserve_ratio": kpi(
                (outstanding / incurred * 100) if incurred else 0,
                unit="percent", rise_is_adverse=True,
            ),
            "closure_rate": kpi(
                (closed_n / n * 100) if n else 0, unit="percent",
            ),
            "avg_days_to_close": kpi(
                avg_days_to_close, unit="days", rise_is_adverse=True,
            ),
        },
        "recent_claims": recent,
        "entitlements": {
            "can_report_claim": sp.has("claims_fnol"),
            "can_export": sp.has("claims_export"),
            "can_view_analytics": sp.has("claims_analytics"),
            "can_view_pii": sp.has("claims_view_pii"),
            "can_view_restricted": sp.has("claims_view_restricted"),
            "can_upload_documents": sp.has("claims_upload_docs"),
            "is_client_admin": sp.has("claims_client_admin"),
        },
    }


class ClaimFilters:
    """
    Advanced multi-criteria search (Fig. 3 p. 16; Epic 3 p. 62).

    Epic 3 names status, line of business, date range, adjuster and reserve amount.
    Figure 3 additionally shows sub-status and sub-product filters. All are optional
    and all are applied on top of the organisational scope clause - never instead of it.
    """

    def __init__(
        self,
        tab: str = "submitted",
        q: str | None = None,
        status: str | None = None,
        sub_status: str | None = None,
        product: str | None = None,
        product_category: str | None = None,
        adjuster: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        reserve_min: float | None = None,
        reserve_max: float | None = None,
        claim_type: str | None = None,
        # Added so the Epic 4 analytics container has somewhere to drill into: a chart
        # grouped by cause of loss is only useful if the list can then show that slice.
        cause_of_loss: str | None = None,
        consequence_of_loss: str | None = None,
        carrier: str | None = None,
    ):
        self.tab = tab
        self.q = q
        self.status = status
        self.sub_status = sub_status
        self.product = product
        self.product_category = product_category
        self.adjuster = adjuster
        self.date_from = date_from
        self.date_to = date_to
        self.reserve_min = reserve_min
        self.reserve_max = reserve_max
        self.claim_type = claim_type
        self.cause_of_loss = cause_of_loss
        self.consequence_of_loss = consequence_of_loss
        self.carrier = carrier

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v not in (None, "")}


def build_claim_where(sp: ScopedPrincipal, f: ClaimFilters) -> tuple[str, dict]:
    """
    Builds the WHERE clause for a claims query.

    Single place that composes scope plus user filters, shared by the list endpoint and
    both export endpoints. Keeping it in one function is what stops an export from
    quietly diverging from what the list showed.
    """
    clause, params = sp.scope_clause()
    own_sql, own_params = _own_only_clause(sp)
    params.update(own_params)

    where = [clause, "is_draft = :draft"]
    params["draft"] = 1 if f.tab == "drafts" else 0

    if not sp.has("claims_view_restricted"):
        where.append("restricted_access = 0")
    if f.status:
        where.append("status = :status")
        params["status"] = f.status
    if f.sub_status:
        where.append("sub_status = :sub_status")
        params["sub_status"] = f.sub_status
    if f.product:
        where.append("global_product = :product")
        params["product"] = f.product
    if f.product_category:
        where.append("global_product_category = :product_category")
        params["product_category"] = f.product_category
    if f.claim_type:
        where.append("claim_type = :claim_type")
        params["claim_type"] = f.claim_type
    if f.adjuster:
        where.append("aon_claim_lead = :adjuster")
        params["adjuster"] = f.adjuster
    if f.cause_of_loss:
        where.append("cause_of_loss = :cause_of_loss")
        params["cause_of_loss"] = f.cause_of_loss
    if f.consequence_of_loss:
        where.append("consequence_of_loss = :consequence_of_loss")
        params["consequence_of_loss"] = f.consequence_of_loss
    if f.carrier:
        where.append("carrier = :carrier")
        params["carrier"] = f.carrier
    if f.date_from:
        where.append("date_of_loss >= :date_from")
        params["date_from"] = f.date_from
    if f.date_to:
        where.append("date_of_loss <= :date_to")
        params["date_to"] = f.date_to
    if f.reserve_min is not None:
        where.append("gross_incurred >= :reserve_min")
        params["reserve_min"] = f.reserve_min
    if f.reserve_max is not None:
        where.append("gross_incurred <= :reserve_max")
        params["reserve_max"] = f.reserve_max
    if f.q:
        where.append(
            "(aon_claim_id LIKE :q OR carrier_policy_number LIKE :q "
            "OR loss_description LIKE :q OR client_claim_ref LIKE :q "
            "OR named_insured LIKE :q OR name_of_loss LIKE :q)"
        )
        params["q"] = f"%{f.q}%"

    return " AND ".join(where) + own_sql, params


CLAIM_SELECT = """
    aon_claim_id, org_node, status, sub_status, claim_type,
    global_product, global_product_category, carrier, carrier_policy_number,
    named_insured, date_of_loss, loss_description, submitted_by, submitted_at,
    gross_incurred, total_paid, total_outstanding, aon_claim_lead,
    aon_claim_lead_email, client_claim_ref, cause_of_loss, consequence_of_loss,
    loss_country, loss_city, loss_address, applicable_deductible, sir_amount,
    date_reported_to_aon, date_reported_to_carrier, currency_code,
    claim_profile, escalated, disputed_claim, disputed_category,
    client_name, entity_group, reporting_line, global_industry, global_sub_industry,
    assigned_team, aon_office, aon_ack_to_client_date, aon_claims_prep_engagement,
    routing_type, name_of_loss, catastrophe, claims_made_date,
    date_insured_first_awareness, prescription_date, claim_closure_date,
    date_last_updated, region, alternative_aon_region, country, loss_region
"""


@router.get("/claims")
def list_claims(
    sp: ScopedPrincipal = Depends(current_scope),
    tab: str = Query("submitted", pattern="^(submitted|drafts)$"),
    q: str | None = None,
    status: str | None = None,
    sub_status: str | None = None,
    product: str | None = None,
    product_category: str | None = None,
    adjuster: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    reserve_min: float | None = None,
    reserve_max: float | None = None,
    claim_type: str | None = None,
    cause_of_loss: str | None = None,
    consequence_of_loss: str | None = None,
    carrier: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),   # NFR-34 payload limit
    sort: str = "date_of_loss",
    dir: str = Query("desc", pattern="^(asc|desc)$"),
):
    filters = ClaimFilters(
        tab=tab, q=q, status=status, sub_status=sub_status, product=product,
        product_category=product_category, adjuster=adjuster,
        date_from=date_from, date_to=date_to,
        reserve_min=reserve_min, reserve_max=reserve_max, claim_type=claim_type,
        cause_of_loss=cause_of_loss, consequence_of_loss=consequence_of_loss,
        carrier=carrier,
    )
    where_sql, params = build_claim_where(sp, filters)
    total = (query_one(f"SELECT COUNT(*) AS n FROM claims WHERE {where_sql}", params) or {}).get("n", 0)

    order_col = sort if sort in SORTABLE else "date_of_loss"
    params["lim"] = page_size
    params["off"] = (page - 1) * page_size

    items = query(
        f"""SELECT {CLAIM_SELECT}
            FROM claims WHERE {where_sql}
            ORDER BY {order_col} {'ASC' if dir == 'asc' else 'DESC'}
            LIMIT :lim OFFSET :off""",
        params,
    )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/claims/{claim_id}")
def claim_detail(claim_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    c = get_claim_in_scope(claim_id, sp.scope, sp.client_id)

    # BR-001: deliberately 403, not 404. We do not confirm or deny existence
    # outside the caller's scope, and the attempt is recorded.
    if not c:
        audit.log_denied(sp.sub, "claim.view", "claim", claim_id)
        raise HTTPException(403, "Claim is outside your authorised organisational scope")

    if c["restricted_access"] and not sp.has("claims_view_restricted"):
        audit.log_denied(sp.sub, "claim.view.restricted", "claim", claim_id)
        raise HTTPException(403, "Restricted-access claim")

    if sp.has("claims_own_only") and c["submitted_by"] != sp.principal.name:
        audit.log_denied(sp.sub, "claim.view.not-own", "claim", claim_id)
        raise HTTPException(403, "You may only view claims you submitted")

    audit.log(sp.sub, "claim.view", "claim", claim_id, c["org_node"])

    milestones = [
        ("Reported", c["date_reported_to_aon"]),
        ("Under Review", c["date_reported_to_carrier"]),
        ("Reserve Set", c["date_reported_to_carrier"] if c["status"] in
            ("Reserve Set", "Closed") else None),
        ("Payment", c["date_reported_to_carrier"] if c["total_paid"] else None),
        ("Closed", c["date_reported_to_carrier"] if c["status"] == "Closed" else None),
    ]
    c["timeline"] = [
        {"milestone": m, "occurred_on": d, "complete": bool(d)} for m, d in milestones
    ]
    c.pop("is_draft", None)
    return c


@router.get("/claims/{claim_id}/documents")
def claim_documents(claim_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    c = get_claim_in_scope(claim_id, sp.scope, sp.client_id)
    if not c:
        audit.log_denied(sp.sub, "document.list", "claim", claim_id)
        raise HTTPException(403, "Claim is outside your authorised organisational scope")

    if not (sp.has("claims_docs") or sp.has("claims_client_admin")):
        raise HTTPException(403, "View Claim Documents privilege not held")

    items, withheld = list_claim_documents(claim_id, is_broker=False)
    audit.log(sp.sub, "document.list", "claim", claim_id, c["org_node"])
    return {"items": items, "withheld": withheld}


@router.get("/documents/{doc_id}/content")
def document_content(doc_id: str, sp: ScopedPrincipal = Depends(current_scope)):
    """
    Proxied document fetch (ADR-001).

    The audience and scope checks are repeated here because a direct request to this
    URL must not bypass them. The ECM reference is resolved server-side and never
    returned to the caller.
    """
    doc = query_one("SELECT * FROM documents WHERE doc_id = :d", {"d": doc_id})
    if not doc:
        raise HTTPException(404, "Document not found")

    if not get_claim_in_scope(doc["claim_id"], sp.scope, sp.client_id):
        audit.log_denied(sp.sub, "document.fetch", "document", doc_id)
        raise HTTPException(403, "Outside your authorised organisational scope")

    if doc["audience"] != "client_visible" or doc["security_attr"] == "internal":
        audit.log_denied(sp.sub, "document.fetch.audience", "document", doc_id)
        raise HTTPException(403, "Document is not client-visible")

    audit.log(sp.sub, "document.fetch", "document", doc_id)
    # A real implementation streams the bytes from ECM through the S-DMS proxy.
    return {
        "doc_id": doc_id,
        "doc_name": doc["doc_name"],
        "content_placeholder": True,
        "note": "POC stub. Production streams bytes from ECM via the S-DMS proxy.",
    }


@router.get("/claims-filter-options")
def claims_filter_options(sp: ScopedPrincipal = Depends(current_scope)):
    """
    Distinct filter values within the caller's own scope.

    Derived from the caller's visible claims rather than a static list, so a user is
    never offered a filter value that would return nothing - and the option list itself
    cannot leak the existence of data outside their scope (BR-001).
    """
    clause, params = sp.scope_clause()

    def distinct(col: str) -> list[str]:
        rows = query(
            f"SELECT DISTINCT {col} AS v FROM claims "
            f"WHERE {clause} AND {col} IS NOT NULL AND {col} != '' "
            f"ORDER BY v",
            params,
        )
        return [r["v"] for r in rows]

    bounds = query_one(
        f"SELECT MIN(gross_incurred) AS lo, MAX(gross_incurred) AS hi, "
        f"MIN(date_of_loss) AS d_lo, MAX(date_of_loss) AS d_hi "
        f"FROM claims WHERE {clause}",
        params,
    ) or {}

    return {
        "status": distinct("status"),
        "sub_status": distinct("sub_status"),
        "product": distinct("global_product"),
        "product_category": distinct("global_product_category"),
        "adjuster": distinct("aon_claim_lead"),
        "claim_type": distinct("claim_type"),
        "reserve_min": bounds.get("lo") or 0,
        "reserve_max": bounds.get("hi") or 0,
        "date_min": bounds.get("d_lo"),
        "date_max": bounds.get("d_hi"),
    }


@router.get("/hierarchy")
def hierarchy(sp: ScopedPrincipal = Depends(current_scope)):
    """The caller's visible slice of the organisational hierarchy."""
    clause, params = sp.scope_clause()
    rows = query(
        f"""SELECT org_node, parent_node, level, display_name, country_code
            FROM org_nodes WHERE {clause} ORDER BY path""",
        params,
    )
    return {"assigned_node": sp.principal.org_node, "nodes": rows}
