import * as React from "react";
import { tokens as t, useI18n } from "@poc/uui-stub";
import type { OktaClaims } from "@poc/contracts";

export interface GlobalNavProps {
  claims: OktaClaims;
  notificationCount: number;
  locale: string;
  onLocaleChange: (l: string) => void;
  onSignOut: () => void;
  onReportClaim?: () => void;
  onNavToList?: () => void;
  onNavToAnalytics?: () => void;
  /** Route name last reported by the MFE, used to mark the current nav item. */
  activeRoute?: string;
  /** Resolved client branding (Epic 6). Absent until the API answers. */
  brand?: { brand_name: string; product_name: string; primary: string };
}

/**
 * Whether the signed-in user may raise an FNOL (BR-005).
 *
 * Derived from the token's groups claim. This is presentation only - the API enforces
 * the same rule independently, so removing the check here would grant nothing.
 */
function canReportClaim(claims: OktaClaims): boolean {
  return (claims.groups ?? []).includes("claims_fnol");
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: `${t.space(1)} ${t.space(3)}`,
  cursor: "pointer",
  font: `${t.font.weight.medium} ${t.font.size.md} ${t.font.family}`,
  color: t.color.grey700,
  borderRadius: t.radius.sm,
  whiteSpace: "nowrap",
};

const activeLinkBtn: React.CSSProperties = {
  ...linkBtn,
  color: t.color.navy700,
  fontWeight: t.font.weight.semibold,
  borderBottom: `2px solid ${t.color.navy700}`,
  borderRadius: 0,
};

export function GlobalNav({
  claims, notificationCount, locale, onLocaleChange, onSignOut,
  onReportClaim, onNavToList, onNavToAnalytics, activeRoute, brand,
}: GlobalNavProps) {
  const { t: tr, locales } = useI18n();
  const analyticsActive = activeRoute === "analytics";
  const claimsActive = !analyticsActive;

  const initials = (claims.name ?? "U")
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      style={{
        background: t.color.white,
        borderBottom: `1px solid ${t.color.grey200}`,
        boxShadow: t.shadow.sm,
        padding: `0 ${t.space(6)}`,
        display: "flex",
        alignItems: "center",
        gap: t.space(4),
        height: 56,
        flex: "0 0 auto",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo. Brand name and product name come from the resolved branding config
          (Epic 6), falling back to Aon house styling before it arrives. */}
      <div style={{
        font: `${t.font.weight.bold} ${t.font.size.lg} ${t.font.family}`,
        letterSpacing: "-0.3px",
        whiteSpace: "nowrap",
        color: brand?.primary ?? t.color.navy900,
        marginRight: t.space(4),
      }}>
        {brand?.brand_name ?? "Aon"}{" "}
        <span style={{ fontWeight: t.font.weight.regular, color: t.color.grey700 }}>
          {brand?.product_name ?? "Claims Copilot"}
        </span>
      </div>

      {/* Nav links */}
      <nav aria-label="Main navigation" style={{ display: "flex", alignItems: "center", gap: t.space(1), height: "100%" }}>
        <button
          style={claimsActive ? activeLinkBtn : linkBtn}
          onClick={onNavToList}
          aria-current={claimsActive ? "page" : undefined}
        >
          {tr("nav.claims")}
        </button>
        <button
          style={analyticsActive ? activeLinkBtn : linkBtn}
          onClick={onNavToAnalytics}
          aria-current={analyticsActive ? "page" : undefined}
        >
          {tr("nav.analytics")}
        </button>
      </nav>

      <div style={{ flex: 1 }} />

      {/*
        Report a Claim CTA - entitlement gated (BR-005).

        This is a shortcut, not the only path. The 56px sticky header has no room for
        an inline explanation, so rather than show a dead control with a hidden
        tooltip we omit it and let the landing page carry the gated button plus its
        visible reason. Hiding a shortcut is safe; hiding the only route would not be.
      */}
      {canReportClaim(claims) && (
        <button
          onClick={onReportClaim}
          style={{
            background: t.color.navy900,
            color: t.color.white,
            border: "none",
            borderRadius: t.radius.md,
            padding: `${t.space(2)} ${t.space(4)}`,
            font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {tr("landing.report_claim")}
        </button>
      )}

      {/* Language picker */}
      <label style={{ display: "flex", alignItems: "center" }}>
        <span className="sr-only">{tr("nav.language")}</span>
        <select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value)}
          style={{
            background: t.color.grey050,
            color: t.color.grey700,
            border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.sm,
            padding: "4px 7px",
            font: `${t.font.size.xs} ${t.font.family}`,
          }}
        >
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.meta.label}
              {l.meta.dir === "rtl" ? " (RTL)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Notifications bell */}
      <div
        title={tr("nav.notifications_unread", { count: notificationCount })}
        style={{ position: "relative", padding: "0 6px", cursor: "default" }}
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke={t.color.grey700} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {notificationCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -2,
            background: t.color.red500, color: t.color.white,
            borderRadius: t.radius.pill, padding: "0 4px",
            font: `${t.font.weight.bold} 9px ${t.font.family}`,
            minWidth: 14, textAlign: "center",
          }}>
            {notificationCount}
          </span>
        )}
        <span className="sr-only">
          {tr("nav.notifications_unread", { count: notificationCount })}
        </span>
      </div>

      {/* Profile avatar + name + sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: t.space(2) }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: t.color.navy700, color: t.color.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          font: `${t.font.weight.bold} 11px ${t.font.family}`,
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ textAlign: "start", lineHeight: 1.25 }}>
          <div style={{ font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`, color: t.color.grey900 }}>
            {claims.name}
          </div>
          <div style={{ font: `10px ${t.font.mono}`, color: t.color.grey500 }} dir="ltr">
            {claims.org_node ?? tr("nav.no_scope")}
          </div>
        </div>
        <button
          onClick={onSignOut}
          style={{
            background: "none",
            border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.sm,
            padding: "3px 8px",
            font: `${t.font.size.xs} ${t.font.family}`,
            color: t.color.grey500,
            cursor: "pointer",
          }}
        >
          {tr("nav.switch_persona")}
        </button>
      </div>
    </header>
  );
}
