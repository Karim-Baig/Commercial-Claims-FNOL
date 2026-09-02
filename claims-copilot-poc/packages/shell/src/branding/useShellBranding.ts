import * as React from "react";
import { API_BASE } from "../config";

/**
 * Resolved branding for the shell chrome — Epic 6 (p. 63).
 *
 * Why the shell fetches this itself rather than receiving it from the MFE
 * ---------------------------------------------------------------------
 * The remote's `BrandProvider` sits below the Module Federation boundary, so its
 * context and CSS variables cannot reach the shell's header. The header is the most
 * brand-bearing surface there is - a client-branded product whose masthead still says
 * "Aon Claims Copilot" has not really been branded - so the shell resolves the brand
 * independently from the same endpoint.
 *
 * Both sides converge because the resolution is server-side: the API derives the
 * client from the caller's own org node, so the shell and the remote cannot disagree
 * about who they are branding for. Duplicating the fetch is the cost of keeping the
 * remote independently deployable (DR-3.7); sharing a runtime singleton across the
 * boundary would not be.
 *
 * The fetch is deliberately non-blocking and failure-tolerant: chrome renders in Aon
 * house styling until the brand arrives, and stays there if the request fails.
 */
export interface ShellBrand {
  brand_name: string;
  product_name: string;
  logo_text: string;
  primary: string;
  accent: string;
  timezone_label: string;
}

export const DEFAULT_SHELL_BRAND: ShellBrand = {
  brand_name: "Aon",
  product_name: "Claims Copilot",
  logo_text: "AON",
  primary: "#0F2B5B",
  accent: "#E8112D",
  timezone_label: "UTC",
};

export function useShellBranding(token: string | null): ShellBrand {
  const [brand, setBrand] = React.useState<ShellBrand>(DEFAULT_SHELL_BRAND);

  React.useEffect(() => {
    if (!token) {
      setBrand(DEFAULT_SHELL_BRAND);
      return;
    }
    let alive = true;

    fetch(`${API_BASE}/api/v1/config/branding`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (alive) setBrand({ ...DEFAULT_SHELL_BRAND, ...b });
      })
      .catch(() => {
        // Branding is cosmetic. An unreachable endpoint must not stop the user
        // reaching their claims.
        if (alive) setBrand(DEFAULT_SHELL_BRAND);
      });

    return () => { alive = false; };
  }, [token]);

  // Published as custom properties on the document root so the global stylesheet in
  // index.html (focus rings in particular) can pick up the brand colour without every
  // rule having to be threaded through React.
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", brand.primary);
    root.style.setProperty("--brand-accent", brand.accent);
  }, [brand.primary, brand.accent]);

  return brand;
}
