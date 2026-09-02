import * as React from "react";
import type { ClaimsAppProps } from "@poc/contracts";
import { Banner, Button, Spinner, useI18n } from "@poc/uui-stub";
import { MfeErrorBoundary } from "./MfeErrorBoundary";
import { shellEventBus } from "./shellEventBus";
import { API_BASE } from "../config";

// Loaded at runtime from the remote's remoteEntry.js, not bundled into the shell.
const ClaimsApp = React.lazy(
  () => import("claimsMfe/ClaimsApp") as Promise<{ default: React.ComponentType<ClaimsAppProps> }>
);

export interface MfeHostProps {
  authToken: string;
  orgNode: string | null;
  userGroups: string[];
  locale: string;
  claimId?: string | null;
  userName?: string;
  navRequest?: { route: "landing" | "list" | "analytics" | "fnol"; ts: number } | null;
}

export function MfeHost({ authToken, orgNode, userGroups, locale, claimId, userName, navRequest }: MfeHostProps) {
  const { t: tr } = useI18n();

  return (
    <MfeErrorBoundary
      fallback={(reset, error) => (
        <div style={{ padding: 24 }}>
          <Banner
            tone="error"
            title={tr("mfe.unavailable_title")}
            action={<Button size="sm" onClick={reset}>{tr("common.retry")}</Button>}
          >
            {tr("mfe.unavailable_body")}
          </Banner>
          <details style={{ marginTop: 16, fontSize: 12, color: "#7B8794" }}>
            <summary style={{ cursor: "pointer" }}>{tr("mfe.tech_detail_poc")}</summary>
            <pre dir="ltr" style={{
              fontFamily: "Consolas, monospace", fontSize: 11, whiteSpace: "pre-wrap",
            }}>
              {error.message}
              {"\n\n"}
              {tr("mfe.dev_server_hint")}
            </pre>
          </details>
        </div>
      )}
    >
      <React.Suspense
        fallback={
          <div style={{ padding: 40, display: "grid", placeItems: "center" }}>
            <Spinner label={tr("mfe.loading_claims")} />
          </div>
        }
      >
        {/* The shell-to-MFE contract: DR-3.1 auth context, DR-3.5 deep-link prop,
            DR-3.8 event interface. Locale is passed so the remote renders in the
            same language the shell is displaying. */}
        <ClaimsApp
          authToken={authToken}
          orgNode={orgNode}
          userGroups={userGroups}
          locale={locale}
          claimId={claimId ?? null}
          userName={userName}
          navRequest={navRequest}
          onEvent={shellEventBus.emit}
          apiBaseUrl={API_BASE}
        />
      </React.Suspense>
    </MfeErrorBoundary>
  );
}
