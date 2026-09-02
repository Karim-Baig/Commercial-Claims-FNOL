import * as React from "react";
import { tokens as t, I18nProvider, useI18n, isRtl, FALLBACK_LOCALE } from "@poc/uui-stub";
import type { ShellEvent } from "@poc/contracts";
import { useAuth } from "./auth/useAuth";
import { parseClaimId } from "./auth/deepLinkState";
import { GlobalNav } from "./layout/GlobalNav";
import { useShellBranding } from "./branding/useShellBranding";
import { PersonaPicker } from "./layout/PersonaPicker";
import { MfeHost } from "./mfe/MfeHost";
import { shellEventBus } from "./mfe/shellEventBus";

const LOCALE_KEY = "poc.locale";

export function App() {
  /**
   * NFR-44: the active locale defaults to the browser Accept-Language preference and
   * is overridable in the interface. Nothing here names a specific locale, so adding
   * one is a matter of dropping a file into packages/i18n/locales.
   */
  const [locale, setLocale] = React.useState<string>(() => {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored) return stored;
    return navigator.language || FALLBACK_LOCALE;
  });

  const changeLocale = React.useCallback((next: string) => {
    localStorage.setItem(LOCALE_KEY, next);
    setLocale(next);
  }, []);

  // NFR-42: document language and direction follow the active locale.
  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  }, [locale]);

  return (
    <I18nProvider locale={locale}>
      <Chrome locale={locale} onLocaleChange={changeLocale} />
    </I18nProvider>
  );
}

function Chrome({
  locale, onLocaleChange,
}: {
  locale: string;
  onLocaleChange: (l: string) => void;
}) {
  const auth = useAuth();
  const { t: tr } = useI18n();
  // Epic 6: the shell resolves branding itself - the remote's provider lives below the
  // federation boundary and cannot reach the header. See useShellBranding.
  const brand = useShellBranding(auth.token);
  const [notifCount, setNotifCount] = React.useState(0);
  const [activeRoute, setActiveRoute] = React.useState("landing");

  // The shell owns its chrome; the MFE only emits events (DR-3.8).
  React.useEffect(
    () =>
      shellEventBus.subscribe((e: ShellEvent) => {
        if (e.type === "claims:notification-count") setNotifCount(e.count);
        if (e.type === "claims:title") document.title = `${e.title} — Aon Meridian`;
        // Keeps the nav's aria-current in step with where the remote actually is.
        if (e.type === "claims:navigated") setActiveRoute(e.path);
      }),
    []
  );

  const [navReq, setNavReq] = React.useState<{ route: "landing" | "list" | "analytics" | "fnol"; ts: number } | null>(null);

  if (!auth.token || !auth.claims) {
    return (
      <PersonaPicker
        personas={auth.personas}
        loading={auth.loading}
        error={auth.error ? tr("auth.api_error") : null}
        pendingPath={
          window.location.pathname !== "/"
            ? window.location.pathname + window.location.search
            : null
        }
        locale={locale}
        onLocaleChange={onLocaleChange}
        onSignIn={auth.signIn}
      />
    );
  }

  // DR-3.5: the deep-link target recovered post-authentication is handed to the MFE
  // as a prop at mount time rather than being re-read from the URL by the remote.
  const deepLinkClaimId =
    parseClaimId(auth.pendingDeepLink) ?? parseClaimId(window.location.pathname);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <GlobalNav
        claims={auth.claims}
        notificationCount={notifCount}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onSignOut={auth.signOut}
        activeRoute={activeRoute}
        brand={brand}
        onReportClaim={() => setNavReq({ route: "fnol", ts: Date.now() })}
        onNavToList={() => setNavReq({ route: "list", ts: Date.now() })}
        onNavToAnalytics={() => setNavReq({ route: "analytics", ts: Date.now() })}
      />
      <main id="main" style={{ flex: 1, background: t.color.grey100 }}>
        <MfeHost
          authToken={auth.token}
          orgNode={auth.claims.org_node}
          userGroups={auth.claims.groups}
          locale={locale}
          claimId={deepLinkClaimId}
          userName={auth.claims.name}
          navRequest={navReq}
        />
      </main>
      <footer style={{
        padding: `${t.space(2)} ${t.space(5)}`,
        background: t.color.white, borderTop: `1px solid ${t.color.grey200}`,
        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        display: "flex", justifyContent: "space-between", gap: t.space(4), flexWrap: "wrap",
      }}>
        <span>{tr("shell.footer_note")}</span>
        <span style={{ fontFamily: t.font.mono }} dir="ltr">
          shell :3000 &nbsp;|&nbsp; claims-mfe :3001 &nbsp;|&nbsp; api :8000
        </span>
      </footer>
    </div>
  );
}
