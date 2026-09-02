/** Audience classification per F-CC-09. Client users only ever see client_visible. */
export type DocumentAudience = "client_visible" | "internal" | "carrier_only";

/** Document-level security attribute per NFR-05. */
export type DocumentSecurityAttr =
  | "default"
  | "internal"
  | "view_on_web"
  | "modify_on_web"
  | "access_controlled";

export interface ClaimDocument {
  doc_id: string;
  claim_id: string;
  doc_name: string;
  doc_type: string;
  size_bytes: number;
  uploaded_at: string;
  security_attr: DocumentSecurityAttr;
  /** Proxy URL. The underlying ECM reference is never sent to the client (ADR-001). */
  url: string;
}
