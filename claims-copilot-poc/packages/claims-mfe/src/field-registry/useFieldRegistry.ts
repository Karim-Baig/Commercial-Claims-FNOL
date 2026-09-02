import type { FieldRegistryEntry, FieldRegistryResponse } from "@poc/contracts";
import { useResource } from "../api/ApiContext";

/**
 * Exhibit 5 field attribute model.
 *
 * The claims list and claim record are driven by this registry rather than by
 * hard-coded field arrays, which is what allows a new field or a visibility change to
 * be a configuration edit rather than a release (NFR-45).
 */
export function useFieldRegistry() {
  const { data, loading, error, reload } = useResource<FieldRegistryResponse>(
    (api) => api.get("/config/field-registry"),
    []
  );

  const all: FieldRegistryEntry[] = data?.fields ?? [];

  return {
    loading,
    error,
    reload,
    all,
    /** Columns for the claims list, ordered by C2S Order. */
    listFields: all
      .filter((f) => f.available_in_meridian && f.show_on_claim_list)
      .sort((a, b) => a.c2s_order - b.c2s_order),
    /** Fields for the claim record surface. */
    recordFields: all
      .filter((f) => f.available_in_meridian && f.show_on_claim_record)
      .sort((a, b) => a.c2s_order - b.c2s_order),
  };
}

/** PII masking applied when the caller lacks the View PII privilege. */
export function maskPii(value: unknown): string {
  const s = String(value ?? "");
  if (!s) return "\u2014";
  return s
    .split(" ")
    .map((w) => (w.length <= 1 ? w : w[0] + "\u2022".repeat(Math.min(w.length - 1, 6))))
    .join(" ");
}
