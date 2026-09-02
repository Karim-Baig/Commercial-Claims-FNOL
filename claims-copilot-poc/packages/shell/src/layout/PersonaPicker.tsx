import * as React from "react";
import { tokens as t, Button, Card, Banner, Spinner, useI18n } from "@poc/uui-stub";
import type { Persona } from "../auth/useAuth";

export interface PersonaPickerProps {
  personas: Persona[];
  loading: boolean;
  error: string | null;
  pendingPath: string | null;
  locale: string;
  onLocaleChange: (l: string) => void;
  onSignIn: (id: number) => void;
}

const GROUP_DESCRIPTIONS: Record<string, { label: string; can: string; cannot: string }> = {
  claims_viewer: {
    label: "Viewer",
    can: "View all claims within their assigned organisational scope",
    cannot: "Cannot see claims outside their scope or take any action on claims",
  },
  claims_analytics: {
    label: "Analytics",
    can: "Access the Analytics dashboard with KPI tiles, trend charts, and performance summaries",
    cannot: "Cannot modify data — read-only dashboard access only",
  },
  claims_export: {
    label: "Export",
    can: "Export the claims list and data to Excel or PDF",
    cannot: "Cannot export data from outside their organisational scope",
  },
  claims_docs: {
    label: "Documents",
    can: "View documents attached to claims (after passing the three-gate security check)",
    cannot: "Cannot see internal adjuster-only notes or carrier-restricted documents",
  },
  claims_upload_docs: {
    label: "Upload Docs",
    can: "Upload new supporting documents to an existing claim",
    cannot: "Cannot delete or replace documents already on record",
  },
  claims_view_pii: {
    label: "View PII",
    can: "See personally identifiable information — claimant names, contact details, addresses",
    cannot: "Without this privilege, PII fields are masked as ****",
  },
  claims_view_restricted: {
    label: "Restricted",
    can: "See claims flagged as sensitive or restricted-access (e.g. disputed, high-value, or escalated)",
    cannot: "Without this, restricted claims are hidden from the list entirely",
  },
  claims_fnol: {
    label: "FNOL",
    can: "File a First Notice of Loss — report a new claim through the guided intake wizard",
    cannot: "Cannot submit claims on behalf of sites outside their assigned scope",
  },
  claims_client_admin: {
    label: "Admin",
    can: "Manage the Configuration Console (field visibility, FNOL outbox); holds all other entitlements automatically",
    cannot: "Cannot modify core platform configuration or system-level settings",
  },
  claims_own_only: {
    label: "Own Only",
    can: "View and track claims they personally submitted",
    cannot: "Cannot see claims filed by colleagues, even at the same site — scope is limited to own submissions",
  },
};

function GroupBadge({ group }: { group: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const desc = GROUP_DESCRIPTIONS[group];

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
    >
      {/* group name chip */}
      <span style={{
        display: "inline-block",
        background: "#e8eef8",
        color: "#2a4a8c",
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 10,
        fontFamily: "monospace",
        lineHeight: 1.8,
        whiteSpace: "nowrap",
      }}>
        {group}
      </span>

      {/* ⓘ button */}
      {desc && (
        <button
          title={`What does ${group} allow?`}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 14, height: 14, borderRadius: "50%",
            background: open ? "#2a4a8c" : "#c5d4f0",
            color: open ? "#fff" : "#2a4a8c",
            border: "none", cursor: "pointer", padding: 0,
            fontSize: 9, fontWeight: 700, lineHeight: 1,
            marginInlineStart: 2, flexShrink: 0,
            transition: "background 0.15s",
          }}
          aria-label={`Info about ${group}`}
          aria-expanded={open}
        >
          i
        </button>
      )}

      {/* tooltip popover */}
      {open && desc && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: 0,
          zIndex: 1000,
          width: 260,
          background: "#1a2a4a",
          color: "#e8eef8",
          borderRadius: 6,
          padding: "10px 12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
          fontSize: 11,
          lineHeight: 1.5,
          pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#fff", fontSize: 12 }}>
            {desc.label}
            <span style={{ fontWeight: 400, color: "#8a9cc4", marginInlineStart: 6 }}>
              ({group})
            </span>
          </div>
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: "#6ee7a0", fontWeight: 600 }}>Can: </span>
            {desc.can}
          </div>
          <div>
            <span style={{ color: "#f87171", fontWeight: 600 }}>Cannot: </span>
            {desc.cannot}
          </div>
          {/* caret */}
          <div style={{
            position: "absolute", bottom: -5, left: 12,
            width: 10, height: 10,
            background: "#1a2a4a",
            transform: "rotate(45deg)",
            borderRadius: 1,
          }} />
        </div>
      )}
    </span>
  );
}

export function PersonaPicker({
  personas, loading, error, pendingPath, locale, onLocaleChange, onSignIn,
}: PersonaPickerProps) {
  const { t: tr, locales } = useI18n();

  return (
    <main
      id="main"
      style={{
        minHeight: "100%", display: "grid", placeItems: "center",
        padding: t.space(6), background: t.color.grey100,
      }}
    >
      <div style={{ width: "min(720px, 100%)" }}>
        {/* Locale is switchable before sign-in, so the whole flow is localised. */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: t.space(3) }}>
          <label style={{ display: "flex", alignItems: "center", gap: t.space(2) }}>
            <span className="sr-only">{tr("nav.language")}</span>
            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value)}
              style={{
                background: t.color.white, color: t.color.grey900,
                border: `1px solid ${t.color.grey300}`, borderRadius: t.radius.sm,
                padding: "5px 9px", font: `${t.font.size.sm} ${t.font.family}`,
              }}
            >
              {locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.meta.label}{l.meta.dir === "rtl" ? " (RTL)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ textAlign: "center", marginBottom: t.space(5) }}>
          <h1 style={{
            margin: 0, font: `${t.font.weight.bold} 26px ${t.font.family}`,
            color: t.color.navy900,
          }}>
            Aon Meridian{" "}
            <span style={{ fontWeight: 400, color: t.color.grey500 }}>
              &mdash; {tr("auth.title_suffix")}
            </span>
          </h1>
          <p style={{
            margin: `${t.space(2)} 0 0`,
            font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey500,
          }}>
            {tr("auth.subtitle")}
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: t.space(4) }}>
            <Banner tone="error" title={tr("auth.api_unavailable")}>{error}</Banner>
          </div>
        )}

        {pendingPath && (
          <div style={{ marginBottom: t.space(4) }}>
            <Banner tone="info" title={tr("auth.deep_link_held")}>
              {tr("auth.deep_link_body", { path: pendingPath })}
            </Banner>
          </div>
        )}

        <Card title={tr("auth.select_persona")} padded={false}>
          {loading ? (
            <div style={{ padding: t.space(8), display: "grid", placeItems: "center" }}>
              <Spinner label={tr("auth.loading_personas")} />
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {personas.map((p, i) => {
                const unscoped = !p.org_node;
                return (
                  <li
                    key={p.persona_id}
                    style={{
                      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      gap: t.space(4), padding: `${t.space(3.5)} ${t.space(4)}`,
                      borderTop: i ? `1px solid ${t.color.grey200}` : "none",
                      background: i % 2 ? t.color.grey050 : t.color.white,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* Role title + persona metadata */}
                      <div style={{
                        font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
                        color: t.color.navy900,
                      }}>
                        {p.example_role}
                        <span style={{
                          marginInlineStart: 8,
                          font: `${t.font.weight.regular} ${t.font.size.xs} ${t.font.family}`,
                          color: t.color.grey500,
                        }}>
                          {tr("auth.persona_line", { id: p.persona_id, level: p.level })}
                        </span>
                      </div>

                      {/* Person name + human-readable scope */}
                      <div style={{
                        marginTop: 3,
                        font: `${t.font.size.sm} ${t.font.family}`,
                        color: t.color.grey700,
                      }}>
                        {p.name}
                        {p.org_display_name && (
                          <span style={{ color: t.color.grey400, marginInlineStart: 6 }}>
                            &mdash; {p.org_display_name}
                          </span>
                        )}
                      </div>

                      {/* org_node claim — monospace, small */}
                      <div dir="ltr" style={{
                        marginTop: 4,
                        font: `11px ${t.font.mono}`,
                        color: t.color.grey500,
                        lineHeight: 1.6,
                      }}>
                        org_node={p.org_node ?? "null"}
                      </div>

                      {/* group badges with ⓘ tooltips */}
                      <div dir="ltr" style={{
                        marginTop: 4,
                        display: "flex", flexWrap: "wrap", gap: "4px 6px",
                        alignItems: "center",
                      }}>
                        <span style={{
                          font: `11px ${t.font.mono}`,
                          color: t.color.grey500,
                          lineHeight: 1.6,
                          marginInlineEnd: 2,
                          flexShrink: 0,
                        }}>
                          groups:
                        </span>
                        {p.groups.length === 0
                          ? <span style={{ font: `11px ${t.font.mono}`, color: t.color.grey400 }}>none</span>
                          : p.groups.map((g) => <GroupBadge key={g} group={g} />)
                        }
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={unscoped ? "secondary" : "primary"}
                      onClick={() => onSignIn(p.persona_id)}
                      style={{ flex: "0 0 auto", marginTop: t.space(0.5) }}
                    >
                      {unscoped ? tr("auth.sign_in_no_access") : tr("auth.sign_in")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <p style={{
          marginTop: t.space(4), textAlign: "center",
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>
          {tr("auth.okta_note")}
        </p>
      </div>
    </main>
  );
}
