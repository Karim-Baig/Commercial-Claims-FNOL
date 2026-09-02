import * as React from "react";
import type { DashboardPreferences, KpiKey, SummaryResponse } from "@poc/contracts";
import {
  tokens as t, Button, GatedAction, Spinner, ErrorState, EmptyState, Card,
  Select, StatusPill, useI18n, translateValue,
} from "@poc/uui-stub";
import { KpiCustomiser } from "./KpiCustomiser";
import { PinnedClaimsPanel } from "../../pins/PinnedClaimsPanel";
import { useResource, useApi } from "../../api/ApiContext";

/** The tiles shown before a user personalises anything. Mirrors the API default. */
const DEFAULT_VISIBLE: string[] = [
  "total_gross_incurred", "avg_gross_incurred", "total_outstanding",
  "total_paid", "largest_claim",
];
import { useEntitlements } from "../../entitlements/useEntitlements";
import { date, kpiValue, money } from "../../format";
import type { ClaimsNav } from "../../ClaimsApp";

export interface LandingScreenProps {
  nav: ClaimsNav;
  orgNode: string | null;
  userName?: string;
}

interface HierarchyNode {
  org_node: string;
  display_name: string;
  level: string;
  parent_node: string | null;
}

export function LandingScreen({ nav, orgNode, userName }: LandingScreenProps) {
  const api = useApi();
  const { locale, emit } = api;
  const { t: tr } = useI18n();
  const ent = useEntitlements();

  // Dashboard personalisation (F9). Stored per user on the API, so the layout
  // follows the user to another device rather than living in this browser.
  const prefsRes = useResource<DashboardPreferences>((a) => a.get("/preferences"), []);
  const [editingKpis, setEditingKpis] = React.useState(false);

  const { data: hierarchy } = useResource<{ assigned_node: string; nodes: HierarchyNode[] }>(
    (api) => api.get("/hierarchy"),
    []
  );
  const [activeNode, setActiveNode] = React.useState<string | null>(null);
  const resolvedNode = activeNode ?? hierarchy?.assigned_node ?? null;

  const { data, loading, error, reload } = useResource<SummaryResponse>(
    (api) => api.get("/summary", resolvedNode ? { org_node: resolvedNode } : undefined),
    [resolvedNode]
  );

  React.useEffect(() => {
    emit({ type: "claims:title", title: tr("nav.claims") });
    emit({ type: "claims:notification-count", count: 3 });
  }, [emit, tr]);

  if (loading) {
    return (
      <div style={{ padding: t.space(10), display: "grid", placeItems: "center" }}>
        <Spinner label={tr("landing.loading_summary")} />
      </div>
    );
  }

  if (error?.status === 403 || !ent.hasAnyAccess) {
    return (
      <Card>
        <EmptyState title={tr("landing.no_access_title")} description={tr("landing.no_access_body")} />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        message={error?.message ?? tr("landing.summary_error")}
        detail={error?.detail}
        onRetry={reload}
      />
    );
  }

  const k = data.kpis;
  const cur = k.total_gross_incurred?.currency ?? "USD";

  // Tiles are derived from whatever the summary returned rather than a local list,
  // so a KPI added server-side appears in the customiser as soon as it has a
  // `kpi.<key>` translation - no change needed in this file.
  const describeKpi = (key: string) => {
    const v = k[key];
    if (!v) return null;
    return {
      label: tr(`kpi.${key}`),
      value: kpiValue(v.value, v.unit, cur, locale, (n) => tr("kpi.days_value", { days: n })),
      deltaPct: v.yoy_pct,
      adverse: Boolean(v.rise_is_adverse),
      footnote: v.aon_claim_id,
    };
  };

  // Preference order wins; anything the API returned but the stored order predates
  // is appended so a new tile is at least reachable in the customiser.
  const serverKeys = Object.keys(k) as KpiKey[];
  const prefs: DashboardPreferences = prefsRes.data ?? {
    kpi_order: serverKeys,
    // Before preferences load, show only the original band rather than all 17.
    kpi_hidden: serverKeys.filter((key) => !DEFAULT_VISIBLE.includes(key)),
    known_kpis: serverKeys,
  };

  const orderedKeys = [
    ...prefs.kpi_order.filter((key) => k[key]),
    ...serverKeys.filter((key) => !prefs.kpi_order.includes(key)),
  ];
  const hiddenKpis = new Set<string>(prefs.kpi_hidden);
  const kpiItems = orderedKeys
    .filter((key) => !hiddenKpis.has(key))
    .map(describeKpi)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  async function applyKpiPrefs(next: { kpi_order: KpiKey[]; kpi_hidden: KpiKey[] }) {
    await api.put("/preferences", next);
    prefsRes.reload();
  }

  async function resetKpiPrefs() {
    await api.del("/preferences");
    prefsRes.reload();
  }

  const displayName = userName?.split(" ")[0] ?? data.org_display_name;

  return (
    <div>
      {/* Welcome heading row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexWrap: "wrap", gap: t.space(3), marginBottom: t.space(6),
      }}>
        <div>
          <h1 style={{
            margin: 0,
            font: `${t.font.weight.bold} ${t.font.size.xxl} ${t.font.family}`,
            color: t.color.navy900, letterSpacing: "-0.5px",
          }}>
            Welcome, {displayName}
          </h1>
          <p style={{ margin: `${t.space(1)} 0 0`, font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey500 }}>
            {tr("landing.subtitle", { claims: data.claim_count, nodes: data.scope_node_count })}
          </p>
        </div>
        {hierarchy && hierarchy.nodes.length > 1 && (
          <Select
            label=""
            value={resolvedNode ?? ""}
            onChange={(e) => setActiveNode(e.target.value || null)}
            options={hierarchy.nodes.map((n) => ({
              value: n.org_node,
              label: `${"  ".repeat(n.org_node.split("-").length - 1)}${n.display_name}`,
            }))}
            style={{ minWidth: 200 }}
          />
        )}
      </div>

      {/* Claims Summary card with inline KPI band */}
      <div style={{
        background: t.color.white,
        border: `1px solid ${t.color.grey200}`,
        borderRadius: t.radius.lg,
        marginBottom: t.space(5),
        overflow: "hidden",
        boxShadow: t.shadow.sm,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: `${t.space(3)} ${t.space(5)}`,
          borderBottom: `1px solid ${t.color.grey200}`,
        }}>
          <span style={{ font: `${t.font.weight.semibold} ${t.font.size.lg} ${t.font.family}`, color: t.color.navy900 }}>
            {tr("landing.claims_summary")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: t.space(3) }}>
            <span style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
              {tr("landing.yoy_note")}
            </span>
            <Button
              size="sm"
              variant="secondary"
              aria-expanded={editingKpis}
              onClick={() => setEditingKpis((v) => !v)}
            >
              {tr("prefs.customise")}
            </Button>
          </span>
        </div>
        {/* Up to five tiles keep the single full-width band from Figure 1. Beyond
            that they wrap, and the 1px grid gap over a grey backing paints the
            dividers in both directions - a per-cell left border would draw a stray
            line down the first tile of every wrapped row. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: kpiItems.length <= 5
            ? `repeat(${Math.max(1, kpiItems.length)}, minmax(0, 1fr))`
            : "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 1,
          background: t.color.grey200,
        }}>
          {kpiItems.map((kpi, i) => (
            <div key={i} style={{
              padding: `${t.space(4)} ${t.space(5)}`,
              background: t.color.white,
            }}>
              <div style={{ font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500, marginBottom: t.space(1) }}>
                {kpi.label}
              </div>
              <div style={{ font: `${t.font.weight.bold} ${t.font.size.xl} ${t.font.family}`, color: t.color.navy900, marginBottom: t.space(1) }}>
                {kpi.value}
              </div>
              {kpi.deltaPct !== undefined && (
                <div style={{
                  font: `${t.font.size.xs} ${t.font.family}`,
                  color: kpi.adverse
                    ? (kpi.deltaPct > 0 ? t.color.red500 : t.color.green600)
                    : (kpi.deltaPct > 0 ? t.color.green600 : t.color.red500),
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <span aria-hidden="true">{kpi.deltaPct > 0 ? "▲" : "▼"}</span>
                  {Math.abs(kpi.deltaPct)}% {tr("kpi.yoy")}
                </div>
              )}
              {kpi.footnote && (
                <div style={{ font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500 }}>
                  {kpi.footnote}
                </div>
              )}
            </div>
          ))}
        </div>

        {editingKpis && (
          <KpiCustomiser
            prefs={prefs}
            labelFor={(key) => tr(`kpi.${key}`)}
            onApply={applyKpiPrefs}
            onReset={resetKpiPrefs}
            onClose={() => setEditingKpis(false)}
          />
        )}
      </div>

      {/* Epic 1: pinned claims sit above Recent Claims - a pin is an explicit choice,
          so it outranks recency. Renders nothing when the user has pinned nothing. */}
      <div style={{ marginBottom: t.space(4) }}>
        <PinnedClaimsPanel nav={nav} />
      </div>

      {/* Two-column: Recent Claims (left) + Resources/Help (right) */}
      <div style={{
        display: "grid", gap: t.space(4),
        gridTemplateColumns: "minmax(0, 2.3fr) 290px",
        alignItems: "start",
      }}>
        {/* Recent Claims */}
        <div style={{
          background: t.color.white, border: `1px solid ${t.color.grey200}`,
          borderRadius: t.radius.lg, overflow: "hidden", boxShadow: t.shadow.sm,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: `${t.space(3)} ${t.space(5)}`, borderBottom: `1px solid ${t.color.grey200}`,
          }}>
            <span style={{ font: `${t.font.weight.semibold} ${t.font.size.lg} ${t.font.family}`, color: t.color.navy900 }}>
              {tr("landing.recent_claims")}
            </span>
            <button onClick={() => nav.toList()} style={{
              background: "none", border: "none", cursor: "pointer",
              font: `${t.font.size.sm} ${t.font.family}`, color: t.color.blue600,
            }}>
              {tr("landing.view_all", { count: data.claim_count })} →
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", font: `${t.font.size.sm} ${t.font.family}` }}>
            <thead>
              <tr style={{ background: t.color.grey050 }}>
                {[tr("field.aon_claim_id"), tr("field.product_line"), tr("field.status"), tr("field.date_of_loss"), tr("field.gross_incurred")].map((h) => (
                  <th key={h} style={{
                    padding: `${t.space(2)} ${t.space(4)}`,
                    textAlign: "left",
                    font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
                    color: t.color.grey500,
                    borderBottom: `1px solid ${t.color.grey200}`,
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent_claims.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: t.space(6), textAlign: "center", color: t.color.grey500 }}>
                    {tr("landing.empty_claims")}
                  </td>
                </tr>
              ) : (
                data.recent_claims.map((r) => (
                  <RecentClaimRow key={r.aon_claim_id} r={r} locale={locale} nav={nav} tr={tr} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Right column: Resources + Help */}
        <div style={{ display: "grid", gap: t.space(3) }}>
          <div style={{
            background: t.color.white, border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.lg, overflow: "hidden", boxShadow: t.shadow.sm,
          }}>
            <div style={{
              padding: `${t.space(3)} ${t.space(4)}`, borderBottom: `1px solid ${t.color.grey200}`,
              font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`, color: t.color.navy900,
            }}>
              Resources
            </div>
            <div style={{ padding: t.space(4), display: "grid", gap: t.space(2) }}>
              <GatedAction
                fullWidth
                allowed={ent.canReportClaim}
                reason={tr("landing.fnol_denied")}
                onClick={nav.toFnol}
              >
                {tr("landing.report_claim")}
              </GatedAction>
              <Button fullWidth variant="secondary" onClick={() => nav.toList()}>
                {tr("landing.view_my_claims")}
              </Button>
              <Button fullWidth variant="secondary" onClick={() => nav.toList("drafts")}>
                {tr("landing.resume_draft")}
              </Button>
              <GatedAction
                fullWidth variant="secondary"
                allowed={ent.canViewAnalytics}
                reason={tr("landing.analytics_denied")}
                onClick={nav.toAnalytics}
              >
                {tr("landing.claims_analytics")}
              </GatedAction>
              {ent.isClientAdmin && (
                <Button fullWidth variant="secondary" onClick={nav.toAdmin}>
                  Configuration Console
                </Button>
              )}
            </div>
          </div>

          <div style={{
            background: t.color.white, border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.lg, overflow: "hidden", boxShadow: t.shadow.sm,
          }}>
            <div style={{
              padding: `${t.space(3)} ${t.space(4)}`, borderBottom: `1px solid ${t.color.grey200}`,
              font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`, color: t.color.navy900,
            }}>
              Help
            </div>
            <div style={{ padding: t.space(4) }}>
              <p style={{
                margin: `0 0 ${t.space(3)}`, font: `${t.font.size.sm} ${t.font.family}`,
                color: t.color.grey700, lineHeight: 1.5,
              }}>
                For support, contact your Aon service team or view the Meridian user guide.
              </p>
              <Button fullWidth variant="secondary" onClick={nav.toNotifications}>
                Notifications
              </Button>
            </div>
          </div>

          <details style={{
            background: t.color.white, border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.lg, overflow: "hidden", boxShadow: t.shadow.sm,
          }}>
            <summary style={{
              padding: `${t.space(3)} ${t.space(4)}`, cursor: "pointer",
              font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
              color: t.color.navy900, userSelect: "none" as const,
            }}>
              {tr("landing.entitlements")}
            </summary>
            <ul style={{ listStyle: "none", margin: 0, padding: `0 ${t.space(4)} ${t.space(2)}`, font: `${t.font.size.sm} ${t.font.family}` }}>
              {([
                ["ent.report_claim", ent.canReportClaim],
                ["ent.view_documents", ent.canViewDocuments],
                ["ent.view_analytics", ent.canViewAnalytics],
                ["ent.export_list", ent.canExport],
                ["ent.view_pii", ent.canViewPii],
                ["ent.view_restricted", ent.canViewRestricted],
              ] as [string, boolean][]).map(([key, on]) => (
                <li key={key} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: `${t.space(1.5)} 0`, borderBottom: `1px solid ${t.color.grey100}`,
                }}>
                  <span style={{ color: t.color.grey700 }}>{tr(key)}</span>
                  <span style={{ color: on ? t.color.green600 : t.color.grey300, fontWeight: 700 }}>
                    {on ? "✓" : tr("common.dash")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

function RecentClaimRow({
  r, locale, nav, tr,
}: {
  r: SummaryResponse["recent_claims"][0];
  locale: string;
  nav: ClaimsNav;
  tr: (key: string, vars?: Record<string, unknown>) => string;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <tr
      onClick={() => nav.toDetail(r.aon_claim_id)}
      style={{ borderBottom: `1px solid ${t.color.grey100}`, background: hovered ? t.color.grey050 : "", cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: `${t.space(2.5)} ${t.space(4)}` }}>
        <span style={{ fontFamily: t.font.mono, fontWeight: 600, color: t.color.blue600, textDecoration: "underline" }}>
          {r.aon_claim_id}
        </span>
      </td>
      <td style={{ padding: `${t.space(2.5)} ${t.space(4)}`, color: t.color.grey700 }}>
        {translateValue(tr, "product", r.global_product)}
      </td>
      <td style={{ padding: `${t.space(2.5)} ${t.space(4)}` }}>
        <StatusPill status={translateValue(tr, "status", r.status)} subStatus={r.sub_status} tone={r.status} />
      </td>
      <td style={{ padding: `${t.space(2.5)} ${t.space(4)}`, color: t.color.grey700, whiteSpace: "nowrap" }}>
        {date(r.date_of_loss, locale)}
      </td>
      <td style={{ padding: `${t.space(2.5)} ${t.space(4)}`, textAlign: "right", fontFamily: t.font.mono, fontSize: t.font.size.sm, color: t.color.grey900 }}>
        {money(r.gross_incurred, r.currency_code, locale)}
      </td>
    </tr>
  );
}
