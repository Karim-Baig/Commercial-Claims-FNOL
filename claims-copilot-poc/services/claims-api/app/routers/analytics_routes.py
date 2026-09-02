"""
Analytics presentation container and drill-down — Epic 4 (p. 62).

Scope boundary
--------------
Epic 4's *content* is delivered by ACIA and is explicitly out of scope for the
Provider. What is in scope is the container it is presented in and the drill-down out
of it. This module implements exactly that boundary and nothing beyond it:

  * the aggregates below are computed from the claims this POC already holds. They
    stand in for ACIA's figures so the container has something real to lay out and
    drill into. They are not an analytics engine and are not trying to be one - there
    is no cohorting, no trend fitting and no benchmark set.
  * swapping in ACIA means replacing `_aggregate` with a call to their service. The
    dimension catalogue, the scope enforcement and the drill-down contract stay.

Drill-down contract
-------------------
Every aggregate row carries a `filters` object whose keys are exactly the ones the
claims list already accepts. That is what makes the drill-down real rather than
decorative: the container does not need to know how to query claims, it hands the
filter set to the list surface and the existing scope enforcement applies unchanged.

Scope
-----
Aggregates are built through `build_claim_where`, the same clause the claims list and
both exports use. An aggregate can therefore never total up a claim the caller could
not have opened - including the restricted-access and own-only rules (BR-001).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth.scope import ScopedPrincipal, current_scope
from ..db import query, query_one
from ..services import audit
from .claims_routes import ClaimFilters, build_claim_where

router = APIRouter(prefix="/analytics", tags=["analytics"])

# (dimension key, claims column, label token, the claims-list filter key it drills into)
#
# A dimension is only offered when it maps onto a filter the list can actually honour.
# A chart that cannot be drilled into is a dead end, and offering one would make the
# container look richer than it is.
DIMENSIONS: list[tuple[str, str, str, str | None]] = [
    ("product", "global_product", "analytics.dim.product", "product"),
    ("product_category", "global_product_category", "analytics.dim.product_category", "product_category"),
    ("status", "status", "analytics.dim.status", "status"),
    ("claim_type", "claim_type", "analytics.dim.claim_type", "claim_type"),
    ("cause_of_loss", "cause_of_loss", "analytics.dim.cause_of_loss", "cause_of_loss"),
    ("consequence_of_loss", "consequence_of_loss", "analytics.dim.consequence_of_loss", "consequence_of_loss"),
    ("carrier", "carrier", "analytics.dim.carrier", "carrier"),
    ("adjuster", "aon_claim_lead", "analytics.dim.adjuster", "adjuster"),
    ("region", "region", "analytics.dim.region", None),
    ("loss_month", "substr(date_of_loss, 1, 7)", "analytics.dim.loss_month", None),
]

DIMENSION_BY_KEY = {d[0]: d for d in DIMENSIONS}

# (measure key, SQL aggregate, label token, formatting hint for the container)
MEASURES: list[tuple[str, str, str, str]] = [
    ("claim_count", "COUNT(*)", "analytics.measure.claim_count", "integer"),
    ("gross_incurred", "COALESCE(SUM(gross_incurred), 0)", "analytics.measure.gross_incurred", "money"),
    ("total_paid", "COALESCE(SUM(total_paid), 0)", "analytics.measure.total_paid", "money"),
    ("total_outstanding", "COALESCE(SUM(total_outstanding), 0)", "analytics.measure.total_outstanding", "money"),
    ("avg_gross_incurred", "COALESCE(AVG(gross_incurred), 0)", "analytics.measure.avg_gross_incurred", "money"),
]

MEASURE_BY_KEY = {m[0]: m for m in MEASURES}

MAX_BUCKETS = 24


@router.get("/dimensions")
def list_dimensions(sp: ScopedPrincipal = Depends(current_scope)):
    """
    The catalogue the container renders its dimension and measure pickers from.

    Served rather than hard-coded in the client for the same reason the field registry
    is: adding a dimension should not need a frontend release.
    """
    if not sp.has("claims_analytics"):
        raise HTTPException(403, "Analytics privilege not held")

    return {
        "dimensions": [
            {"key": k, "label_token": tok, "drillable": filter_key is not None}
            for k, _col, tok, filter_key in DIMENSIONS
        ],
        "measures": [
            {"key": k, "label_token": tok, "format": fmt}
            for k, _sql, tok, fmt in MEASURES
        ],
        # Stated so the container can label the panel honestly rather than implying
        # these are ACIA's numbers.
        "source": "poc_claims",
        "source_note": "analytics.source.poc_claims",
    }


def _aggregate(
    sp: ScopedPrincipal, dimension: str, filters: ClaimFilters
) -> list[dict]:
    """
    Groups the caller's in-scope claims by one dimension.

    This is the seam ACIA replaces. Everything around it - the catalogue, the scope
    clause, the drill-down filters - is container concern and stays either way.
    """
    _key, column, _tok, filter_key = DIMENSION_BY_KEY[dimension]
    where, params = build_claim_where(sp, filters)

    measure_sql = ", ".join(f"{sql} AS {key}" for key, sql, _t, _f in MEASURES)

    rows = query(
        f"""SELECT {column} AS bucket, {measure_sql}
            FROM claims
            WHERE {where}
            GROUP BY {column}
            ORDER BY claim_count DESC, bucket
            LIMIT {MAX_BUCKETS}""",
        params,
    )

    out = []
    for r in rows:
        bucket = r["bucket"]
        entry = {k: r[k] for k, _s, _t, _f in MEASURES}
        entry["key"] = bucket
        entry["label"] = bucket if bucket not in (None, "") else "Unspecified"
        # The drill-down payload. Empty when the dimension has no matching list filter,
        # which is why `drillable` is advertised in the catalogue.
        entry["filters"] = (
            {filter_key: bucket} if filter_key and bucket not in (None, "") else {}
        )
        out.append(entry)
    return out


@router.get("/aggregate")
def aggregate(
    sp: ScopedPrincipal = Depends(current_scope),
    dimension: str = Query("product"),
    status: str | None = Query(None),
    product: str | None = Query(None),
    product_category: str | None = Query(None),
    claim_type: str | None = Query(None),
    adjuster: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    cause_of_loss: str | None = Query(None),
    consequence_of_loss: str | None = Query(None),
    carrier: str | None = Query(None),
):
    """
    One dimension's aggregate rows, plus the scope total for percentage-of-whole.

    The same filter parameters the claims list takes are accepted here, so a drill-down
    can be applied *and then* re-grouped - which is what turns a single chart into an
    explorable container rather than a fixed report.
    """
    if not sp.has("claims_analytics"):
        raise HTTPException(403, "Analytics privilege not held")
    if dimension not in DIMENSION_BY_KEY:
        raise HTTPException(
            422, f"Unknown dimension. Available: {', '.join(DIMENSION_BY_KEY)}"
        )

    filters = ClaimFilters(
        tab="submitted", status=status, product=product,
        product_category=product_category, claim_type=claim_type,
        adjuster=adjuster, date_from=date_from, date_to=date_to,
        cause_of_loss=cause_of_loss, consequence_of_loss=consequence_of_loss,
        carrier=carrier,
    )

    rows = _aggregate(sp, dimension, filters)

    where, params = build_claim_where(sp, filters)
    measure_sql = ", ".join(f"{sql} AS {key}" for key, sql, _t, _f in MEASURES)
    totals = query_one(
        f"SELECT {measure_sql} FROM claims WHERE {where}", params
    ) or {k: 0 for k, _s, _t, _f in MEASURES}

    audit.log(sp.sub, "analytics.aggregate", "analytics", dimension, sp.principal.org_node)

    return {
        "dimension": dimension,
        "applied_filters": filters.as_dict(),
        "items": rows,
        "totals": totals,
        "truncated": len(rows) >= MAX_BUCKETS,
        "source": "poc_claims",
    }
