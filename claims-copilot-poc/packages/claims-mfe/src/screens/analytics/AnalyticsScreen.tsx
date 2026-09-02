import * as React from "react";
import {
  tokens as t, Button, Card, PageHeader, Banner, Spinner, ErrorState,
  useI18n, translateValue,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { compactMoney, count as fmtCount } from "../../format";
import type { ClaimsNav } from "../../ClaimsApp";
import type { ClaimFilterState } from "../claims-list/useClaimFilters";

/**
 * Analytics presentation container — Epic 4 (p. 62).
 *
 * Scope discipline
 * ----------------
 * The analytics *content* is ACIA's delivery and is explicitly out of scope for the
 * Provider. What this screen delivers is the boundary around it:
 *
 *   1. the presentation container - dimension and measure selection, layout, labelling;
 *   2. the scope context (org_node from the JWT, BR-002) the embed would receive;
 *   3. drill-down routing back into the claims list with filters pre-applied.
 *
 * The figures come from `/analytics/aggregate`, computed over the claims this
 * environment holds. They stand in for ACIA's numbers so the container has something
 * real to lay out and drill into, and the panel says so rather than implying otherwise.
 *
 * Why the bars are CSS and not a chart library
 * --------------------------------------------
 * A charting dependency would be a decision about ACIA's rendering stack, which is not
 * the Provider's to make. A proportional bar is enough to prove the container and the
 * drill-down work, and it leaves the embed swap unconstrained.
 */

interface DimensionMeta {
  key: string;
  label_token: string;
  drillable: boolean;
}

interface MeasureMeta {
  key: string;
  label_token: string;
  format: "integer" | "money";
}

interface Catalogue {
  dimensions: DimensionMeta[];
  measures: MeasureMeta[];
  source: string;
  source_note: string;
}

interface AggregateRow {
  key: string | null;
  label: string;
  claim_count: number;
  gross_incurred: number;
  total_paid: number;
  total_outstanding: number;
  avg_gross_incurred: number;
  filters: Partial<ClaimFilterState>;
}

interface AggregateResponse {
  dimension: string;
  applied_filters: Record<string, string>;
  items: AggregateRow[];
  totals: Record<string, number>;
  truncated: boolean;
}

/** Values arrive from the API in English; only the label is localised. */
function localiseBucket(
  tr: (k: string, p?: Record<string, string | number>) => string,
  dimension: string,
  raw: string
): string {
  if (dimension === "status") return translateValue(tr, "status", raw);
  if (dimension === "product") return translateValue(tr, "product", raw);
  if (dimension === "claim_type") return translateValue(tr, "claim_type", raw);
  return raw;
}

export function AnalyticsScreen({ nav }: { nav: ClaimsNav }) {
  const { t: tr } = useI18n();
  const { locale } = useApi();

  const [dimension, setDimension] = React.useState("product");
  const [measure, setMeasure] = React.useState<keyof AggregateRow>("gross_incurred");
  // A drill-down applied *inside* the container: filter by one dimension, then
  // re-group by another. This is what makes it explorable rather than a fixed report.
  const [drill, setDrill] = React.useState<{ key: string; value: string; label: string } | null>(null);

  const { data: catalogue, error: catError } = useResource<Catalogue>(
    (api) => api.get("/analytics/dimensions"),
    []
  );

  const { data: summary } = useResource<any>((api) => api.get("/summary"), []);

  const drillParams = React.useMemo(
    () => (drill ? { [drill.key]: drill.value } : {}),
    [drill]
  );

  const { data, loading, error, reload } = useResource<AggregateResponse>(
    (api) => api.get("/analytics/aggregate", { dimension, ...drillParams }),
    [dimension, JSON.stringify(drillParams)]
  );

  const measures = catalogue?.measures ?? [];
  const activeMeasure = measures.find((m) => m.key === measure);

  const currency = summary?.kpis?.total_gross_incurred?.currency ?? "USD";

  const formatMeasure = React.useCallback(
    (value: number) =>
      activeMeasure?.format === "integer"
        ? fmtCount(value, locale)
        : compactMoney(value, currency, locale),
    [activeMeasure, locale, currency]
  );

  const rows = data?.items ?? [];
  const peak = Math.max(...rows.map((r) => Number(r[measure]) || 0), 1);
  const totalForMeasure = Number(data?.totals?.[measure] ?? 0);

  // Entitlement is enforced server-side; a 403 here means the persona lacks
  // claims_analytics, which is a legitimate state rather than an error to retry.
  if (catError?.status === 403) {
    return (
      <>
        <PageHeader
          title={tr("nav.analytics")}
          breadcrumb={
            <Button variant="ghost" size="sm" onClick={nav.toLanding}>
              &larr; {tr("list.back_overview")}
            </Button>
          }
        />
        <Banner tone="warning" title={tr("api.forbidden")}>
          {tr("entitlement.analytics_required")}
        </Banner>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr("nav.analytics")}
        subtitle={summary?.org_display_name ?? undefined}
        breadcrumb={
          <Button variant="ghost" size="sm" onClick={nav.toLanding}>
            &larr; {tr("list.back_overview")}
          </Button>
        }
      />

      {/* The container is honest about whose numbers these are. */}
      <Banner tone="info" title={tr("nav.analytics")}>
        {tr("analytics.source.poc_claims")}
      </Banner>

      {summary && (
        <div style={{
          marginTop: t.space(3),
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>
          {tr("analytics.scope_context", {
            node: summary.org_node ?? "—",
            count: summary.scope_node_count ?? 0,
          })}
        </div>
      )}

      {/* Dimension and measure pickers, built from the served catalogue so a new
          dimension does not need a frontend release. */}
      <div style={{
        display: "flex", gap: t.space(4), flexWrap: "wrap", alignItems: "flex-end",
        margin: `${t.space(4)} 0`,
      }}>
        <label style={{ display: "block" }}>
          <span style={{
            display: "block", marginBottom: t.space(1),
            font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
            color: t.color.grey700,
          }}>
            {tr("analytics.group_by")}
          </span>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            style={selectStyle}
          >
            {(catalogue?.dimensions ?? []).map((d) => (
              <option key={d.key} value={d.key}>{tr(d.label_token)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          <span style={{
            display: "block", marginBottom: t.space(1),
            font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
            color: t.color.grey700,
          }}>
            {tr("analytics.measure_label")}
          </span>
          <select
            value={String(measure)}
            onChange={(e) => setMeasure(e.target.value as keyof AggregateRow)}
            style={selectStyle}
          >
            {measures.map((m) => (
              <option key={m.key} value={m.key}>{tr(m.label_token)}</option>
            ))}
          </select>
        </label>

        {drill && (
          <div style={{ display: "flex", alignItems: "center", gap: t.space(2) }}>
            <span style={{
              background: t.color.teal050, color: t.color.teal700,
              borderRadius: t.radius.pill, padding: `2px 10px`,
              font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
            }}>
              {tr("analytics.filtered_by", { label: drill.label })}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setDrill(null)}>
              {tr("analytics.clear_filter")}
            </Button>
          </div>
        )}
      </div>

      <Card padded>
        {error ? (
          <ErrorState message={error.message} detail={error.detail} onRetry={reload} />
        ) : loading ? (
          <div style={{ padding: t.space(8), textAlign: "center" }}>
            <Spinner label={tr("common.loading")} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            padding: t.space(8), textAlign: "center", color: t.color.grey500,
            font: `${t.font.size.sm} ${t.font.family}`,
          }}>
            {tr("analytics.no_data")}
          </div>
        ) : (
          <>
            <p style={{
              margin: `0 0 ${t.space(3)}`,
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
            }}>
              {tr("analytics.drill_hint")}
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{
                captionSide: "top", textAlign: "start", paddingBottom: t.space(2),
                font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey700,
              }}>
                {activeMeasure ? tr(activeMeasure.label_token) : ""}
              </caption>
              <tbody>
                {rows.map((row) => {
                  const value = Number(row[measure]) || 0;
                  const share = totalForMeasure > 0 ? (value / totalForMeasure) * 100 : 0;
                  const label = localiseBucket(tr, dimension, row.label);
                  const canDrill = Object.keys(row.filters).length > 0;

                  return (
                    <tr key={String(row.key ?? row.label)}>
                      <th scope="row" style={{
                        textAlign: "start", padding: `${t.space(2)} ${t.space(3)} ${t.space(2)} 0`,
                        font: `${t.font.weight.regular} ${t.font.size.sm} ${t.font.family}`,
                        color: t.color.grey900, whiteSpace: "nowrap", verticalAlign: "middle",
                      }}>
                        {label}
                      </th>

                      {/* Proportional bar. Width is presentational; the figure beside
                          it is what is actually read, so the bar carries aria-hidden. */}
                      <td style={{ padding: `${t.space(2)} ${t.space(3)}`, width: "55%" }}>
                        <div aria-hidden="true" style={{
                          height: 10, borderRadius: t.radius.pill,
                          background: t.color.grey100, overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.max(2, (value / peak) * 100)}%`, height: "100%",
                            background: "var(--brand-primary, #0F2B5B)",
                            borderRadius: t.radius.pill,
                          }} />
                        </div>
                      </td>

                      <td style={{
                        padding: `${t.space(2)} ${t.space(3)}`, textAlign: "end",
                        font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
                        color: t.color.navy900, whiteSpace: "nowrap",
                      }}>
                        {formatMeasure(value)}
                      </td>

                      <td style={{
                        padding: `${t.space(2)} ${t.space(3)}`, textAlign: "end",
                        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                        whiteSpace: "nowrap",
                      }}>
                        {tr("analytics.of_total", { percent: `${share.toFixed(0)}%` })}
                      </td>

                      <td style={{
                        padding: `${t.space(2)} 0 ${t.space(2)} ${t.space(3)}`,
                        textAlign: "end", whiteSpace: "nowrap",
                      }}>
                        <span style={{ display: "inline-flex", gap: t.space(1) }}>
                          {/* Re-group under this slice, staying in the container. */}
                          {canDrill && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const [key, value_] = Object.entries(row.filters)[0];
                                setDrill({ key, value: String(value_), label });
                              }}
                            >
                              {tr("analytics.regroup")}
                            </Button>
                          )}
                          {/* Leave the container for the pre-filtered claims list. */}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!canDrill}
                            onClick={() =>
                              nav.toList("submitted", { ...drillParams, ...row.filters } as Partial<ClaimFilterState>)
                            }
                          >
                            {tr("analytics.drill")}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data?.truncated && (
              <p style={{
                marginTop: t.space(3),
                font: `${t.font.size.xs} ${t.font.family}`, color: t.color.amber600,
              }}>
                {tr("analytics.truncated", { count: rows.length })}
              </p>
            )}
          </>
        )}
      </Card>
    </>
  );
}

const selectStyle: React.CSSProperties = {
  padding: `${t.space(2)} ${t.space(3)}`,
  border: `1px solid ${t.color.grey300}`,
  borderRadius: t.radius.sm,
  font: `${t.font.size.sm} ${t.font.family}`,
  color: t.color.grey900,
  background: t.color.white,
  minWidth: 180,
};
