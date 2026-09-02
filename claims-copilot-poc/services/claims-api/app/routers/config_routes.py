"""
Configuration surfaces.

The field registry implements the Exhibit 5 attribute model. It is served from the
database and can be edited without a code change or deployment, which is the
NFR-45 requirement.

Branding (Epic 6, p. 63) follows the same principle but is file-backed rather than
database-backed: it is deployment configuration rather than something a client admin
edits through the UI, and holding it in `config/branding.json` keeps it reviewable in
version control.
"""
import json
from datetime import datetime, timezone
from pathlib import Path as FsPath
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from .. import settings
from ..auth.scope import ScopedPrincipal, current_scope
from ..auth.tokens import Principal, current_principal
from ..db import get_conn, query, query_one

router = APIRouter(prefix="/config", tags=["config"])

# Keys a client or country layer is allowed to override. Everything else in the design
# system stays fixed: a client may not repaint status colours or lower text contrast
# below the AA floor, because those carry meaning and accessibility guarantees rather
# than brand identity.
BRANDABLE_KEYS = {
    "brand_name", "product_name", "logo_text", "logo_mark",
    "primary", "accent", "header_bg", "header_fg",
    "timezone", "timezone_label",
}

BRAND_FALLBACK = {
    "brand_name": "Aon",
    "product_name": "Meridian Claims Copilot",
    "logo_text": "AON",
    "logo_mark": "navy",
    "primary": "#0F2B5B",
    "accent": "#E8112D",
    "header_bg": "#0A1F42",
    "header_fg": "#FFFFFF",
    "timezone": "UTC",
    "timezone_label": "UTC",
}


def _load_branding() -> dict:
    path = FsPath(settings.CONFIG_DIR) / "branding.json"
    if not path.exists():
        return {}
    try:
        # utf-8-sig: these files are hand-edited and Windows editors often add a BOM.
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError):
        # A malformed brand file must not take the application down - the product
        # falls back to Aon default styling and stays usable.
        return {}


def _layer(source: dict | None) -> dict:
    """Only the brandable keys from one layer, so an unknown key cannot be injected."""
    return {k: v for k, v in (source or {}).items() if k in BRANDABLE_KEYS}


@router.get("/branding")
def branding(
    sp: ScopedPrincipal = Depends(current_scope),
    country: str | None = Query(None, description="ISO-2 country override"),
):
    """
    The resolved brand for the caller — default, then client, then country.

    The client is derived from the caller's own organisational node rather than taken
    from a parameter, so a user cannot request another client's branding and read their
    trading name out of the response.
    """
    cfg = _load_branding()

    org = query_one(
        "SELECT display_name FROM org_nodes WHERE org_node = :o",
        {"o": sp.principal.org_node},
    ) if sp.principal.org_node else None

    # The client key is the group's named insured, which for this dataset is the
    # display name held against the root org node.
    root = query_one(
        "SELECT display_name FROM org_nodes WHERE parent_node IS NULL"
    ) or {}
    client_key = root.get("display_name")

    resolved = {
        **BRAND_FALLBACK,
        **_layer(cfg.get("default")),
        **_layer((cfg.get("clients") or {}).get(client_key)),
        **_layer((cfg.get("countries") or {}).get((country or "").upper())),
    }

    return {
        **resolved,
        "client_key": client_key,
        "country": (country or "").upper() or None,
        "org_display_name": (org or {}).get("display_name"),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@router.get("/countries/{country_code}")
def country_config(
    country_code: str = Path(..., min_length=2, max_length=2),
    _: Principal = Depends(current_principal),
):
    """
    Country configuration — locale, currency, text direction, required documents and
    data residency (Epic 6, p. 63).

    Already consumed server-side by the map provider policy; exposed here so the FNOL
    wizard and the date formatter can read the same file rather than duplicating its
    values in the client.
    """
    path = FsPath(settings.CONFIG_DIR) / "countries" / f"{country_code.upper()}.json"
    if not path.exists():
        raise HTTPException(404, f"No configuration for country '{country_code.upper()}'")
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError) as exc:
        raise HTTPException(500, "Country configuration is unreadable") from exc


@router.get("/field-registry")
def field_registry(_: Principal = Depends(current_principal)):
    rows = query("SELECT * FROM field_registry ORDER BY c2s_order")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fields": [
            {
                "field_key": r["field_key"],
                "label_token": r["label_token"],
                "available_in_meridian": bool(r["available_in_meridian"]),
                "dynamic_category": r["dynamic_category"],
                "is_pii": bool(r["is_pii"]),
                "in_analytics_model": bool(r["in_analytics_model"]),
                "show_on_claim_list": bool(r["show_on_claim_list"]),
                "show_on_claim_record": bool(r["show_on_claim_record"]),
                "show_on_client_analytics": bool(r["show_on_client_analytics"]),
                "c2s_order": r["c2s_order"],
                "default_visibility": r["default_visibility"],
                "value_type": r["value_type"],
            }
            for r in rows
        ],
    }


class FieldRegistryPatch(BaseModel):
    show_on_claim_list: bool | None = None
    show_on_claim_record: bool | None = None
    show_on_client_analytics: bool | None = None
    default_visibility: str | None = None
    c2s_order: int | None = None


@router.post("/field-registry/{field_key}")
def patch_field_registry(
    field_key: str = Path(...),
    body: FieldRegistryPatch = ...,
    sp: ScopedPrincipal = Depends(current_scope),
):
    """
    Updates a field's visibility flags in the registry — no code change, no deployment (NFR-45).
    Requires claims_client_admin privilege.
    """
    if not sp.has("claims_client_admin"):
        raise HTTPException(403, "Client Admin privilege required to modify field registry")

    existing = query(
        "SELECT field_key FROM field_registry WHERE field_key = :k",
        {"k": field_key},
    )
    if not existing:
        raise HTTPException(404, f"Field '{field_key}' not found in registry")

    # Only update the fields present in the request body.
    updates: dict[str, Any] = {}
    if body.show_on_claim_list is not None:
        updates["show_on_claim_list"] = int(body.show_on_claim_list)
    if body.show_on_claim_record is not None:
        updates["show_on_claim_record"] = int(body.show_on_claim_record)
    if body.show_on_client_analytics is not None:
        updates["show_on_client_analytics"] = int(body.show_on_client_analytics)
    if body.default_visibility is not None:
        updates["default_visibility"] = body.default_visibility
    if body.c2s_order is not None:
        updates["c2s_order"] = body.c2s_order

    if not updates:
        return {"field_key": field_key, "updated": False, "reason": "no changes"}

    set_clause = ", ".join(f"{col} = :{col}" for col in updates)
    params = {**updates, "k": field_key}
    conn = get_conn()
    conn.execute(
        f"UPDATE field_registry SET {set_clause} WHERE field_key = :k",
        params,
    )
    conn.commit()

    return {
        "field_key": field_key,
        "updated": True,
        "changes": updates,
        "note": "No rebuild or redeployment required (NFR-45). "
                "The config API serves the updated values on the next request.",
    }
