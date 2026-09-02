export interface Money {
  value: number;
  currency: string;
}

/**
 * How a KPI value should be rendered. Carried on the value itself so the dashboard
 * can display a tile it has no specific knowledge of.
 */
export type KpiUnit = "money" | "count" | "percent" | "days";

export interface KpiValue extends Money {
  yoy_pct?: number;
  aon_claim_id?: string;
  unit?: KpiUnit;
  /** True where an increase is bad news, e.g. outstanding reserve. */
  rise_is_adverse?: boolean;
}

/** GET /api/v1/summary - drives the landing page (Figure 1). */
export interface SummaryResponse {
  org_node: string;
  org_display_name: string;
  scope_node_count: number;
  claim_count: number;
  /**
   * Keyed by KpiKey. Partial because the set can grow server-side ahead of the
   * client, so a consumer must tolerate a key it does not recognise being absent.
   */
  kpis: Partial<Record<import("./f9").KpiKey, KpiValue>> &
    Record<string, KpiValue | undefined>;
  recent_claims: ClaimListRow[];
  entitlements: import("./auth").Entitlements;
}

export interface ClaimListRow {
  aon_claim_id: string;
  org_node: string;
  status: string;
  sub_status: string | null;
  claim_type: "Claim" | "Incident";
  global_product: string;
  carrier: string | null;
  carrier_policy_number: string | null;
  date_of_loss: string;
  loss_description: string | null;
  named_insured: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  gross_incurred: number;
  currency_code: string;
  [key: string]: unknown;
}

export interface ClaimsListResponse {
  items: ClaimListRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface ClaimDetail extends ClaimListRow {
  client_claim_ref: string | null;
  total_paid: number;
  total_outstanding: number;
  applicable_deductible: number | null;
  sir_amount: number | null;
  cause_of_loss: string | null;
  consequence_of_loss: string | null;
  loss_country: string | null;
  loss_city: string | null;
  loss_address: string | null;
  loss_latitude: number | null;
  loss_longitude: number | null;
  aon_claim_lead: string | null;
  aon_claim_lead_email: string | null;
  date_reported_to_aon: string | null;
  date_reported_to_carrier: string | null;
  timeline: ClaimTimelineEntry[];
}

export interface ClaimTimelineEntry {
  milestone: string;
  occurred_on: string | null;
  complete: boolean;
}

export interface ClaimsQuery {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  product?: string;
  tab?: "submitted" | "drafts";
  sort?: string;
  dir?: "asc" | "desc";
}
