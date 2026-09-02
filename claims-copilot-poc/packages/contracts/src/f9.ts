/**
 * F9 contracts — dashboard personalisation, adjuster messaging, draft continuity.
 */

// ── Dashboard personalisation (Epic 1) ───────────────────────────────────────

/**
 * Keys the dashboard can render. Mirrors KNOWN_KPIS in preference_routes.py.
 *
 * The first five are visible by default; the rest are opt-in through the
 * customiser. Each key needs a matching `kpi.<key>` translation.
 */
export type KpiKey =
  // Shown by default.
  | "total_gross_incurred"
  | "avg_gross_incurred"
  | "total_outstanding"
  | "total_paid"
  | "largest_claim"
  // Available to add.
  | "total_claims"
  | "open_claims"
  | "closed_claims"
  | "claims_last_30_days"
  | "escalated_claims"
  | "disputed_claims"
  | "avg_paid_per_claim"
  | "total_deductible"
  | "total_sir"
  | "reserve_ratio"
  | "closure_rate"
  | "avg_days_to_close";

export interface DashboardPreferences {
  kpi_order: KpiKey[];
  kpi_hidden: KpiKey[];
  known_kpis: KpiKey[];
  is_default?: boolean;
  updated_at?: string;
}

// ── In-context adjuster messaging (Epic 3) ───────────────────────────────────

/** Who wrote the message. Set server-side from the caller, never from the payload. */
export type MessageAuthorRole = "client" | "aon";

export interface ClaimMessage {
  message_id: string;
  author_name: string;
  author_role: MessageAuthorRole;
  body: string;
  created_at: string;
  /** True when the caller authored it, so the thread can align it correctly. */
  is_own: boolean;
}

export interface ClaimMessageThread {
  items: ClaimMessage[];
  /**
   * Count of Aon-internal notes filtered out before the response was built.
   * Reported so the UI can be honest that the thread is not the whole record.
   */
  withheld: number;
}

// ── Cross-device draft continuity (Epic 5) ───────────────────────────────────

export interface FnolDraftSummary {
  draft_id: string;
  site_org_node: string | null;
  label: string | null;
  current_step: number;
  /** Where the draft was last touched, e.g. "Safari on iPhone". */
  last_device: string | null;
  created_at: string;
  updated_at: string;

  // ── Delegation (Epic 2) ──
  // A draft keeps its original owner; delegation grants a second person edit and
  // submit rights. Only the owner may re-delegate or delete, so the UI needs to know
  // which side of the grant the current viewer is on.
  owned_by_me: boolean;
  /** Who the owner shared it with, if anyone. */
  delegate_name: string | null;
  /** Who shared it with the viewer, when `owned_by_me` is false. */
  delegated_by_name: string | null;
  delegated_at: string | null;
}

export interface FnolDraft extends FnolDraftSummary {
  /** The wizard's saved field values. Shape follows the active form config. */
  values: Record<string, unknown>;
}
