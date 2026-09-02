/**
 * Exhibit 5 field attribute model. The claims list and claim record are driven
 * by this registry, never by hard-coded field arrays.
 */
export interface FieldRegistryEntry {
  field_key: string;
  label_token: string;
  available_in_meridian: boolean;
  dynamic_category: string | null;
  is_pii: boolean;
  in_analytics_model: boolean;
  show_on_claim_list: boolean;
  show_on_claim_record: boolean;
  show_on_client_analytics: boolean;
  c2s_order: number;
  default_visibility: "show" | "hide";
  value_type: "text" | "number" | "money" | "date" | "status" | "enum";
}

export interface FieldRegistryResponse {
  fields: FieldRegistryEntry[];
  generated_at: string;
}
