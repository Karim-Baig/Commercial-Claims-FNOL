import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

/**
 * Loss location map (Figure 4).
 *
 * Two renderers behind one interface:
 *
 *   schematic - a coordinate plot with a labelled graticule and no network access at
 *               all. This is the default. A loss address is Confidential data and is
 *               flagged PII in the field registry, so until the Privacy Impact
 *               Assessment names an approved tile vendor, sending anything to a third
 *               party is not a decision this component should make quietly.
 *
 *   tile      - real raster tiles, fetched through the API's own proxy rather than
 *               direct from the vendor. The browser never contacts the map provider,
 *               so no subscription key reaches the client and there is a single
 *               auditable egress point.
 *
 * The tile grid is plain slippy-map arithmetic - no mapping library is added, which
 * keeps the dependency surface unchanged and means the same renderer serves any
 * XYZ provider by swapping a URL template in configuration.
 */

export type MapMode = "schematic" | "tile";

export interface LocationMapProps {
  latitude: number | null;
  longitude: number | null;
  /** Human-readable location line, used for the accessible description. */
  label: string;
  mode: MapMode;
  /** Absolute tile template containing {z}, {x} and {y}. Required when mode="tile". */
  tileUrl?: string | null;
  attribution?: string | null;
  zoom?: number;
  height?: number;
  /** Set when the configured provider was downgraded, e.g. "data_residency". */
  downgradeReason?: string | null;
  /** True when the coordinate is an approximation rather than a real geocode. */
  approximate?: boolean;
}

const TILE = 256;

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function LocationMap({
  latitude, longitude, label, mode, tileUrl, attribution,
  zoom = 15, height = 240, downgradeReason, approximate,
}: LocationMapProps) {
  const tr = useT();
  const [box, setBox] = React.useState({ w: 640, h: height });
  const ref = React.useRef<HTMLDivElement>(null);

  // Tile count depends on the rendered width, so measure rather than assume.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth || 640, h: height });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth || 640, h: height });
    return () => ro.disconnect();
  }, [height]);

  const hasPoint = typeof latitude === "number" && typeof longitude === "number";

  const frame: React.CSSProperties = {
    position: "relative",
    height,
    borderRadius: t.radius.md,
    border: `1px solid ${t.color.grey200}`,
    overflow: "hidden",
    background: t.color.grey050,
  };

  if (!hasPoint) {
    return (
      <div ref={ref} style={{ ...frame, display: "grid", placeItems: "center" }}>
        <span style={{
          font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
          textAlign: "center", padding: t.space(4),
        }}>
          {tr("detail.map_no_coords")}
        </span>
      </div>
    );
  }

  const lat = latitude as number;
  const lon = longitude as number;
  const coordText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  // ── tile renderer ──────────────────────────────────────────────────────
  let tiles: React.ReactNode = null;
  if (mode === "tile" && tileUrl) {
    const fx = lonToTileX(lon, zoom);
    const fy = latToTileY(lat, zoom);
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    // Where the centre tile's top-left corner sits so the point lands mid-viewport.
    const originX = box.w / 2 - (fx - cx) * TILE;
    const originY = box.h / 2 - (fy - cy) * TILE;
    const spanX = Math.ceil(box.w / TILE / 2) + 1;
    const spanY = Math.ceil(box.h / TILE / 2) + 1;
    const max = 2 ** zoom;

    const nodes: React.ReactNode[] = [];
    for (let dx = -spanX; dx <= spanX; dx++) {
      for (let dy = -spanY; dy <= spanY; dy++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (ty < 0 || ty >= max) continue;
        const wrapped = ((tx % max) + max) % max;
        const url = tileUrl
          .replace("{z}", String(zoom))
          .replace("{x}", String(wrapped))
          .replace("{y}", String(ty));
        nodes.push(
          <img
            key={`${tx}:${ty}`}
            src={url}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={TILE}
            height={TILE}
            style={{
              position: "absolute",
              left: originX + dx * TILE,
              top: originY + dy * TILE,
              width: TILE,
              height: TILE,
              userSelect: "none",
            }}
          />
        );
      }
    }
    tiles = nodes;
  }

  // ── schematic renderer: graticule only, no network ─────────────────────
  const schematic = mode !== "tile" && (
    <>
      <svg
        aria-hidden="true"
        width="100%"
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <pattern id="poc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0 L0 0 0 40" fill="none" stroke={t.color.grey200} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height={height} fill="url(#poc-grid)" />
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke={t.color.grey300} strokeDasharray="4 4" />
        <line x1="50%" y1="0" x2="50%" y2={height} stroke={t.color.grey300} strokeDasharray="4 4" />
      </svg>
      <span style={{
        position: "absolute", top: t.space(2), left: t.space(2),
        font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500,
        background: "rgba(255,255,255,.82)", padding: "1px 6px",
        borderRadius: t.radius.sm,
      }} dir="ltr">
        {coordText}
      </span>
    </>
  );

  return (
    <div>
      <div
        ref={ref}
        role="img"
        aria-label={tr("detail.map_alt", { location: label || coordText })}
        style={frame}
      >
        {tiles}
        {schematic}

        {/* Centre pin */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -100%)",
            width: 16, height: 16, borderRadius: "50% 50% 50% 0",
            background: t.color.red500,
            border: `2px solid ${t.color.white}`,
            rotate: "-45deg",
            boxShadow: "0 2px 6px rgba(0,0,0,.28)",
          }}
        />

        {attribution && (
          <span style={{
            position: "absolute", bottom: 0, right: 0,
            font: `10px ${t.font.family}`, color: t.color.grey700,
            background: "rgba(255,255,255,.82)", padding: "1px 5px",
            borderStartStartRadius: t.radius.sm,
          }} dir="ltr">
            {attribution}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", gap: t.space(3),
        flexWrap: "wrap", marginTop: t.space(2),
        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
      }}>
        <span>
          {tr("detail.map_coords")}:{" "}
          <span dir="ltr" style={{ fontFamily: t.font.mono, color: t.color.grey700 }}>
            {coordText}
          </span>
          {approximate ? ` · ${tr("detail.map_approximate")}` : null}
        </span>
        {mode !== "tile" && (
          <span>
            {downgradeReason === "data_residency"
              ? tr("detail.map_residency")
              : tr("detail.map_tiles_off")}
          </span>
        )}
      </div>
    </div>
  );
}
