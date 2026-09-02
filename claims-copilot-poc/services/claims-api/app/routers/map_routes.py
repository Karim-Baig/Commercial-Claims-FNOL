"""
Map policy and tile proxy.

Two rules shape this module:

  * The browser never talks to a map vendor. It requests tiles from this service,
    which forwards them upstream. That keeps any subscription key server-side, gives
    a single auditable egress point, and means a tile request carries no client
    identity or address to the vendor - only z/x/y.

  * Residency wins over preference. If a country is marked as needing to stay
    in-region (NFR-12), the resolved mode is schematic regardless of the configured
    provider, and the tile proxy refuses to serve it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response

from .. import settings
from ..auth.tokens import Principal, current_principal

router = APIRouter(prefix="/map", tags=["map"])

_TILE_CACHE: dict[tuple[int, int, int], bytes] = {}
_CACHE_LIMIT = 512


def _load_policy() -> dict:
    path = Path(settings.CONFIG_DIR) / "maps.json"
    if not path.exists():
        return {"provider": "none", "zoom": 15, "providers": {"none": {"kind": "schematic"}}}
    # utf-8-sig: these files are hand-edited and Windows editors often add a BOM.
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def _country_requires_in_region(country_code: str | None) -> bool:
    if not country_code:
        return False
    path = Path(settings.CONFIG_DIR) / "countries" / f"{country_code.upper()}.json"
    if not path.exists():
        return False
    try:
        # utf-8-sig: these files are hand-edited and Windows editors often add a BOM.
        with open(path, encoding="utf-8-sig") as f:
            cfg = json.load(f)
        return bool((cfg.get("data_residency") or {}).get("must_remain_in_region"))
    except Exception:
        return False


def resolve_provider(country_code: str | None) -> tuple[str, dict, str | None]:
    """Returns (provider name, provider config, reason it was downgraded)."""
    policy = _load_policy()
    providers = policy.get("providers", {})
    name = policy.get("provider", "none")
    reason: str | None = None

    # Residency is checked first because it is the binding constraint (NFR-12) and is
    # the reason worth reporting to the user. A country override that happens to reach
    # the same outcome should not mask it.
    if _country_requires_in_region(country_code) and providers.get(name, {}).get("kind") == "tile":
        name, reason = "none", "data_residency"
    else:
        override = (policy.get("country_overrides") or {}).get((country_code or "").upper())
        if override and override != name:
            name, reason = override, "country_override"

    cfg = providers.get(name) or {"kind": "schematic"}

    # A provider that needs a key it has not been given cannot be used.
    if cfg.get("kind") == "tile" and cfg.get("requires_key") and not os.getenv("AZURE_MAPS_KEY"):
        return "none", providers.get("none", {"kind": "schematic"}), "missing_key"

    return name, cfg, reason


@router.get("/config")
def map_config(country: str | None = None, _: Principal = Depends(current_principal)):
    policy = _load_policy()
    name, cfg, reason = resolve_provider(country)
    return {
        "provider": name,
        "mode": cfg.get("kind", "schematic"),
        "zoom": policy.get("zoom", 15),
        "attribution": cfg.get("attribution"),
        # Relative to the API base. Deliberately not the upstream URL.
        "tile_url": "/api/v1/map/tile/{z}/{x}/{y}" if cfg.get("kind") == "tile" else None,
        "downgrade_reason": reason,
    }


@router.get("/tile/{z}/{x}/{y}")
async def tile(z: int, x: int, y: int, country: str | None = None,
               _: Principal = Depends(current_principal)):
    """Proxies a single map tile. Requires a valid token like every other route."""
    if not (0 <= z <= 20):
        raise HTTPException(400, "Unsupported zoom")
    limit = 2 ** z
    if not (0 <= x < limit and 0 <= y < limit):
        raise HTTPException(400, "Tile out of range")

    name, cfg, reason = resolve_provider(country)
    if cfg.get("kind") != "tile":
        raise HTTPException(409, f"Tile service unavailable ({reason or name})")

    key = (z, x, y)
    if key in _TILE_CACHE:
        return Response(_TILE_CACHE[key], media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})

    url = (cfg["upstream"]
           .replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
           .replace("{key}", os.getenv("AZURE_MAPS_KEY", "")))

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            # A descriptive User-Agent is required by the OSM tile usage policy.
            r = await client.get(url, headers={
                "User-Agent": "ClaimsCopilotPOC/0.1 (Aon Meridian proof of concept)"
            })
        r.raise_for_status()
    except Exception as exc:
        raise HTTPException(502, f"Upstream tile request failed: {exc}") from exc

    if len(_TILE_CACHE) < _CACHE_LIMIT:
        _TILE_CACHE[key] = r.content

    return Response(r.content, media_type=r.headers.get("content-type", "image/png"),
                    headers={"Cache-Control": "public, max-age=86400"})
