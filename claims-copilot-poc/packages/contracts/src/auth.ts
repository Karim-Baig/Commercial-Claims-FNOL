/** Claims carried in the Okta access token. Mirrors the Pillar 2 JWT contract. */
export interface OktaClaims {
  sub: string;
  name: string;
  /** Organisational node the user is assigned to. Drives BR-001 scope. */
  org_node: string | null;
  /** Role groups, e.g. ["claims_viewer", "claims_fnol"]. */
  groups: string[];
  locale: string;
  persona_id: number;
  exp: number;
}

export type Privilege =
  | "claims_viewer"
  | "claims_fnol"
  | "claims_docs"
  | "claims_upload_docs"
  | "claims_analytics"
  | "claims_export"
  | "claims_view_pii"
  | "claims_view_restricted"
  | "claims_client_admin"
  | "claims_own_only";

export interface Entitlements {
  can_report_claim: boolean;
  can_export: boolean;
  can_view_analytics: boolean;
  can_view_pii: boolean;
  can_view_restricted: boolean;
  can_upload_documents: boolean;
  is_client_admin: boolean;
}
