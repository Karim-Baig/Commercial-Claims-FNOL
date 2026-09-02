import { useApi } from "../api/ApiContext";

/**
 * Client-side privilege checks.
 *
 * These drive presentation only - hiding a button the user cannot use. Every
 * privilege is independently enforced server-side, so removing the check in the
 * browser grants nothing.
 */
export function useEntitlements() {
  const { groups } = useApi();
  const has = (g: string) => groups.includes(g);

  return {
    canReportClaim: has("claims_fnol"),
    canViewClaims: has("claims_viewer") || has("claims_own_only"),
    canViewDocuments: has("claims_docs"),
    canUploadDocuments: has("claims_upload_docs") || has("claims_docs"),
    canViewAnalytics: has("claims_analytics"),
    canExport: has("claims_export"),
    canViewPii: has("claims_view_pii"),
    canViewRestricted: has("claims_view_restricted"),
    isClientAdmin: has("claims_client_admin"),
    ownClaimsOnly: has("claims_own_only"),
    hasAnyAccess: groups.length > 0,
  };
}
