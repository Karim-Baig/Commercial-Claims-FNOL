import type { OktaClaims } from "@poc/contracts";

/**
 * Decodes a JWT payload for display purposes only.
 *
 * The shell never trusts these values for authorisation. Organisational scope is
 * re-derived server-side from the validated token on every request (BR-001 /
 * F-CC-07), so a tampered client-side claim changes nothing.
 */
export function decodeJwt(token: string): OktaClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json))) as OktaClaims;
  } catch {
    return null;
  }
}
