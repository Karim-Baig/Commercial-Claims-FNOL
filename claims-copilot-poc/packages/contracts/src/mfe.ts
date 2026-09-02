/**
 * The shell-to-Micro-Frontend contract.
 * Traceability: DR-3.1 (auth context), DR-3.5 (deep-link prop hand-off at mount),
 * DR-3.8 (shell event interface).
 */
export interface ClaimsAppProps {
  /** Okta access token. Passed by the shell; never fetched by the MFE. */
  authToken: string;
  /** org_node claim, decoded by the shell. Display only - the API re-derives it. */
  orgNode: string | null;
  userGroups: string[];
  locale: string;
  /** Display name of the authenticated user (from JWT name claim). */
  userName?: string;
  /** Deep-link target recovered from the PKCE state parameter. DR-3.5. */
  claimId?: string | null;
  /** Shell event bus. DR-3.8. */
  onEvent?: (event: ShellEvent) => void;
  apiBaseUrl?: string;
  /** Shell-initiated navigation request. ts prevents duplicate fires on re-render. */
  navRequest?: { route: "landing" | "list" | "analytics" | "fnol"; ts: number } | null;
}

export type ShellEvent =
  | { type: "claims:navigated"; path: string }
  | { type: "claims:title"; title: string }
  | { type: "claims:notification-count"; count: number }
  | { type: "claims:error"; message: string };
