import * as React from "react";
import type { ClaimsAppProps } from "@poc/contracts";
import { tokens as t, I18nProvider } from "@poc/uui-stub";
import { ApiProvider } from "./api/ApiContext";
import { LandingScreen } from "./screens/landing/LandingScreen";
import { ClaimsListScreen } from "./screens/claims-list/ClaimsListScreen";
import { ClaimDetailScreen } from "./screens/claim-detail/ClaimDetailScreen";
import { FnolWizard } from "./screens/fnol/FnolWizard";
import { NotificationCentreScreen } from "./screens/notifications/NotificationCentreScreen";
import { AnalyticsScreen } from "./screens/analytics/AnalyticsScreen";
import { AdminConfigScreen } from "./screens/admin/AdminConfigScreen";
import { BrandProvider } from "./branding/BrandProvider";
import type { ClaimFilterState } from "./screens/claims-list/useClaimFilters";

type Route =
  | { name: "landing" }
  | {
      name: "list";
      tab?: "submitted" | "drafts";
      /** Pre-applied criteria, set when the analytics container drills through. */
      filters?: Partial<ClaimFilterState>;
    }
  | { name: "detail"; claimId: string }
  | { name: "fnol"; draftId?: string }
  | { name: "notifications" }
  | { name: "analytics" }
  | { name: "admin" };

/**
 * The exposed Micro-Frontend root (ADR-003).
 *
 * Everything it needs arrives as props from the shell, including the active locale.
 * The remote carries its own copy of the resource bundles, so it renders in the
 * shell's language without sharing a translation runtime instance across the
 * federation boundary - which keeps DR-3.7 independent deployability intact.
 */
export default function ClaimsApp({
  authToken, orgNode, userGroups, locale, claimId, onEvent, apiBaseUrl, userName, navRequest,
}: ClaimsAppProps) {
  // DR-3.5: a deep-linked claim id opens Claim Detail directly, skipping the list.
  const [route, setRoute] = React.useState<Route>(() =>
    claimId ? { name: "detail", claimId } : { name: "landing" }
  );

  React.useEffect(() => {
    if (claimId) setRoute({ name: "detail", claimId });
  }, [claimId]);

  // Shell-initiated navigation (e.g. from GlobalNav "Report a Claim" or "Claims List" links).
  React.useEffect(() => {
    if (!navRequest) return;
    switch (navRequest.route) {
      case "landing": setRoute({ name: "landing" }); break;
      case "list": setRoute({ name: "list" }); break;
      case "analytics": setRoute({ name: "analytics" }); break;
      case "fnol": setRoute({ name: "fnol" }); break;
    }
  }, [navRequest?.ts]);

  React.useEffect(() => {
    onEvent?.({ type: "claims:navigated", path: route.name });
  }, [route, onEvent]);

  const nav = React.useMemo(
    () => ({
      toLanding: () => setRoute({ name: "landing" }),
      toList: (tab?: "submitted" | "drafts", filters?: Partial<ClaimFilterState>) =>
        setRoute({ name: "list", tab, filters }),
      toDetail: (id: string) => setRoute({ name: "detail", claimId: id }),
      toFnol: (draftId?: string) => setRoute({ name: "fnol", draftId }),
      toNotifications: () => setRoute({ name: "notifications" }),
      toAnalytics: () => setRoute({ name: "analytics" }),
      toAdmin: () => setRoute({ name: "admin" }),
    }),
    []
  );

  return (
    <I18nProvider locale={locale}>
      <ApiProvider
        token={authToken}
        baseUrl={apiBaseUrl ?? "http://localhost:8000"}
        locale={locale}
        groups={userGroups}
        onEvent={onEvent}
      >
        <BrandProvider>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          padding: `${t.space(6)} ${t.space(5)} ${t.space(10)}`,
        }}>
          {route.name === "landing"       && <LandingScreen nav={nav} orgNode={orgNode} userName={userName} />}
          {route.name === "list"          && <ClaimsListScreen nav={nav} initialTab={route.tab} initialFilters={route.filters} />}
          {route.name === "detail"        && <ClaimDetailScreen nav={nav} claimId={route.claimId} />}
          {route.name === "fnol"          && <FnolWizard nav={nav} draftId={route.draftId} />}
          {route.name === "notifications" && <NotificationCentreScreen nav={nav} />}
          {route.name === "analytics"     && <AnalyticsScreen nav={nav} />}
          {route.name === "admin"         && <AdminConfigScreen nav={nav} />}
        </div>
        </BrandProvider>
      </ApiProvider>
    </I18nProvider>
  );
}

export type ClaimsNav = {
  toLanding: () => void;
  /** `filters` pre-applies criteria, used by the analytics drill-down. */
  toList: (tab?: "submitted" | "drafts", filters?: Partial<ClaimFilterState>) => void;
  toDetail: (id: string) => void;
  /** Opens the FNOL wizard, resuming a saved draft when an id is supplied. */
  toFnol: (draftId?: string) => void;
  toNotifications: () => void;
  toAnalytics: () => void;
  toAdmin: () => void;
};
