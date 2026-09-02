"""
Address to coordinate resolution.

Exhibit 1 lists **Loqate** (marked with an asterisk - approved subject to licensing
confirmation) as the address verification tool, and Exhibit 4 asks whether the FNOL
Loss Location field could use an address selector similar to CCP. Loqate is therefore
the natural place for this to live in production: verify the address at capture time
and persist the coordinates it returns, rather than geocoding on every page view.

The POC keeps that shape but does not call Loqate. Seeded sites carry real
coordinates; anything else resolves through a deterministic local fallback so the map
surface always has something to render. Swapping in Loqate means replacing
`resolve()` only.

No client address is ever sent to a third party from this module.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class GeoPoint:
    latitude: float
    longitude: float
    #  "seeded"   - known site coordinate held against the org node
    #  "verified" - returned by the address verification provider (Loqate)
    #  "derived"  - deterministic local fallback, not a real geocode
    source: str


# Approximate coordinates for the seeded concession sites.
SITE_COORDS: dict[str, tuple[float, float]] = {
    "CORP-HOSP": (40.7128, -74.0060),
    "LOC-JFK": (40.6413, -73.7781),
    "LOC-LHR": (51.4700, -0.4543),
    "LOC-SIN": (1.3644, 103.9915),
    "SITE-JFK-T4-BISTRO": (40.6437, -73.7823),
    "SITE-JFK-T4-CAFE": (40.6446, -73.7835),
    "SITE-JFK-T7-GRILL": (40.6480, -73.7770),
    "SITE-LHR-T2-DELI": (51.4700, -0.4543),
    "SITE-LHR-T5-BAR": (51.4700, -0.4880),
    "SITE-LHR-T3-KIOSK": (51.4712, -0.4590),
    "SITE-SIN-T1-NOODLE": (1.3592, 103.9894),
    "SITE-SIN-T3-LOUNGE": (1.3560, 103.9860),
    "SITE-SIN-T4-BAKERY": (1.3383, 103.9840),
    # ── second tenant ────────────────────────────────────────────────────────
    "CORP-RETAIL": (53.4808, -2.2426),
    "LOC-NW-NORTH": (53.8008, -1.5491),
    "LOC-NW-SOUTH": (51.4545, -2.5879),
    "SITE-NW-LEEDS": (53.7797, -1.5389),
    "SITE-NW-YORK": (53.9583, -1.0803),
    "SITE-NW-BRISTOL": (51.5203, -2.6031),
}

# Country centroids, used only by the derived fallback.
COUNTRY_CENTRES: dict[str, tuple[float, float]] = {
    "US": (39.8283, -98.5795),
    "GB": (54.0000, -2.0000),
    "SG": (1.3521, 103.8198),
    "AE": (24.4539, 54.3773),
    "ES": (40.4637, -3.7492),
    "FR": (46.6034, 1.8883),
    "DE": (51.1657, 10.4515),
}


def resolve(
    org_node: str | None = None,
    address: str | None = None,
    country_code: str | None = None,
) -> GeoPoint | None:
    """Best available coordinate for a loss location, or None if nothing is known."""
    if org_node and org_node in SITE_COORDS:
        lat, lon = SITE_COORDS[org_node]
        return GeoPoint(lat, lon, "seeded")

    centre = COUNTRY_CENTRES.get((country_code or "").upper())
    if not centre:
        return None

    # Deterministic jitter so the same address always lands in the same place.
    # This is explicitly not a geocode - it is flagged "derived" so the interface can
    # tell the user the position is approximate.
    seed = hashlib.sha256((address or "").encode("utf-8")).digest()
    jitter_lat = (seed[0] / 255.0 - 0.5) * 1.4
    jitter_lon = (seed[1] / 255.0 - 0.5) * 1.4
    return GeoPoint(centre[0] + jitter_lat, centre[1] + jitter_lon, "derived")
