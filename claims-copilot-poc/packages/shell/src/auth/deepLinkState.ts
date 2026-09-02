/**
 * Deep-link handling across the authentication boundary.
 *
 * Requirement: every notification carries a direct link, and the link must survive
 * authentication so an unauthenticated recipient is signed in and then landed on the
 * intended record rather than a generic home page.
 *
 * Mechanism: the intended path is encoded into the OAuth2 PKCE `state` parameter
 * (F-MER-04), recovered after the redirect, and handed to the Micro-Frontend as a
 * prop at mount time (DR-3.5).
 */

export interface DeepLinkState {
  nonce: string;
  deepLink: string | null;
}

const KEY = "poc.pendingDeepLink";

export function encodeState(deepLink: string | null): string {
  const payload: DeepLinkState = {
    nonce: crypto.randomUUID(),
    deepLink,
  };
  return btoa(JSON.stringify(payload));
}

export function decodeState(state: string): DeepLinkState | null {
  try {
    return JSON.parse(atob(state)) as DeepLinkState;
  } catch {
    return null;
  }
}

/** Captures the path the user actually asked for before the auth redirect. */
export function captureIntendedPath(): string | null {
  const path = window.location.pathname + window.location.search;
  if (path === "/" || path.startsWith("/callback")) return null;
  sessionStorage.setItem(KEY, encodeState(path));
  return path;
}

/** Recovers the intended path after authentication completes. */
export function consumeIntendedPath(): string | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  return decodeState(raw)?.deepLink ?? null;
}

/** Extracts a claim id from a deep-link path such as /claims/CLM-0061. */
export function parseClaimId(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/\/claims\/([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}
