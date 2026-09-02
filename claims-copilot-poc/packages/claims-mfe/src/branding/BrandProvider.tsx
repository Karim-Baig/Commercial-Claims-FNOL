import * as React from "react";
import { useApi } from "../api/ApiContext";

/**
 * Client and country-specific branding — Epic 6 (p. 63).
 *
 * Why a provider and not a token override
 * ---------------------------------------
 * The design system exports `tokens` as a frozen module-level object that every
 * component imports directly. Mutating it would brand the app by side effect, and
 * every consumer would have to re-render on a change it cannot observe. Instead the
 * resolved brand is published two ways:
 *
 *   * as context, for the handful of surfaces that are genuinely brand-bearing;
 *   * as CSS custom properties on a wrapper element, so a surface can opt in with
 *     `var(--brand-primary)` without threading a prop through the tree.
 *
 * What is deliberately *not* brandable: status colours, semantic feedback tones and
 * body text contrast. Those carry meaning and an accessibility guarantee, and letting
 * a client repaint "Closed" or dim body copy below the AA floor would break both. The
 * server enforces the same restriction with its `BRANDABLE_KEYS` allowlist, so this is
 * not a client-side convention that a crafted config could slip past.
 *
 * The timezone travels with the brand rather than with the locale on purpose. Locale
 * decides how a time is written; the programme decides which clock it is written in.
 * Two colleagues reading one claim in London and Singapore need the same wall-clock
 * time, which the browser's own zone would not give them.
 */
export interface Brand {
  brand_name: string;
  product_name: string;
  logo_text: string;
  primary: string;
  accent: string;
  header_bg: string;
  header_fg: string;
  timezone: string;
  timezone_label: string;
  client_key: string | null;
  /** False until the API answers, so a surface can avoid flashing default styling. */
  resolved: boolean;
}

/**
 * Aon default styling. Used before the API answers and if it fails: an unreachable
 * branding endpoint must degrade to the house brand, never to an unstyled page.
 */
export const DEFAULT_BRAND: Brand = {
  brand_name: "Aon",
  product_name: "Meridian Claims Copilot",
  logo_text: "AON",
  primary: "#0F2B5B",
  accent: "#E8112D",
  header_bg: "#0A1F42",
  header_fg: "#FFFFFF",
  timezone: "UTC",
  timezone_label: "UTC",
  client_key: null,
  resolved: false,
};

const BrandContext = React.createContext<Brand>(DEFAULT_BRAND);

export interface BrandProviderProps {
  /** Country whose overrides apply, when the user is working in one. */
  country?: string | null;
  children: React.ReactNode;
}

export function BrandProvider({ country, children }: BrandProviderProps) {
  const api = useApi();
  const [brand, setBrand] = React.useState<Brand>(DEFAULT_BRAND);

  React.useEffect(() => {
    let alive = true;
    api
      .get<Partial<Brand>>("/config/branding", country ? { country } : undefined)
      .then((b) => {
        if (alive) setBrand({ ...DEFAULT_BRAND, ...b, resolved: true });
      })
      .catch(() => {
        // Branding is presentation only. Falling back keeps the app usable rather
        // than blocking the claims surfaces on a cosmetic request.
        if (alive) setBrand({ ...DEFAULT_BRAND, resolved: true });
      });
    return () => { alive = false; };
  }, [api, country]);

  const cssVars = {
    "--brand-primary": brand.primary,
    "--brand-accent": brand.accent,
    "--brand-header-bg": brand.header_bg,
    "--brand-header-fg": brand.header_fg,
  } as React.CSSProperties;

  return (
    <BrandContext.Provider value={brand}>
      <div style={cssVars}>{children}</div>
    </BrandContext.Provider>
  );
}

export function useBrand(): Brand {
  return React.useContext(BrandContext);
}
