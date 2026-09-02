import * as React from "react";
import type { OktaClaims } from "@poc/contracts";
import { API_BASE } from "../config";
import { decodeJwt } from "./decodeJwt";
import { captureIntendedPath, consumeIntendedPath } from "./deepLinkState";

const TOKEN_KEY = "poc.accessToken";

export interface Persona {
  persona_id: number;
  name: string;
  example_role: string;
  level: string;
  org_node: string | null;
  org_display_name: string | null;
  groups: string[];
}

export interface AuthState {
  token: string | null;
  claims: OktaClaims | null;
  personas: Persona[];
  loading: boolean;
  error: string | null;
  pendingDeepLink: string | null;
  signIn: (personaId: number) => Promise<void>;
  signOut: () => void;
  clearDeepLink: () => void;
}

/**
 * Authentication for the POC.
 *
 * AUTH_MODE=mock  - the API issues a locally signed token for a chosen persona so the
 *                   POC runs with no external dependency. Dev only.
 * AUTH_MODE=okta  - replaced by the Okta PKCE redirect flow. Custom identity stores
 *                   are not permitted under the Meridian Pattern (NFR-33), so Okta is
 *                   the production path; only this hook changes.
 */
export function useAuth(): AuthState {
  const [token, setToken] = React.useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  );
  const [personas, setPersonas] = React.useState<Persona[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingDeepLink, setPendingDeepLink] = React.useState<string | null>(null);

  // Capture the requested path before any sign-in occurs.
  React.useEffect(() => {
    if (!sessionStorage.getItem(TOKEN_KEY)) captureIntendedPath();
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/auth/personas`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (alive) setPersonas(data.personas ?? []);
      } catch {
        if (alive) {
          setError(
            "Cannot reach the Claims API. Start it with: python -m uvicorn app.main:app --reload --port 8000"
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const signIn = React.useCallback(async (personaId: number) => {
    setError(null);
    const r = await fetch(`${API_BASE}/api/v1/auth/mock-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona_id: personaId }),
    });
    if (!r.ok) {
      setError("Sign-in failed.");
      return;
    }
    const { access_token } = await r.json();
    sessionStorage.setItem(TOKEN_KEY, access_token);
    setToken(access_token);
    setPendingDeepLink(consumeIntendedPath());
  }, []);

  const signOut = React.useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPendingDeepLink(null);
    window.history.replaceState({}, "", "/");
  }, []);

  return {
    token,
    claims: token ? decodeJwt(token) : null,
    personas,
    loading,
    error,
    pendingDeepLink,
    signIn,
    signOut,
    clearDeepLink: () => setPendingDeepLink(null),
  };
}
