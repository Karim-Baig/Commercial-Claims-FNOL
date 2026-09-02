import * as React from "react";
import type { ClaimsListResponse, ClaimListRow } from "@poc/contracts";
import {
  tokens as t, Button, ErrorState, Spinner,
  useI18n, translateValue,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { useEntitlements } from "../../entitlements/useEntitlements";
import { maskPii, useFieldRegistry } from "../../field-registry/useFieldRegistry";
import { date, money } from "../../format";
import { DraftsPanel } from "./DraftsPanel";
import { AdvancedFilters } from "./AdvancedFilters";
import { SavedViewsBar } from "./SavedViewsBar";
import { ExportMenu } from "./ExportMenu";
import { toQuery, useClaimFilters } from "./useClaimFilters";
import type { ClaimFilterState, FilterOptions } from "./useClaimFilters";
import { PinButton, usePins } from "../../pins/usePins";
import type { ClaimsNav } from "../../ClaimsApp";

export interface ClaimsListScreenProps {
  nav: ClaimsNav;
  initialTab?: "submitted" | "drafts";
  /** Criteria to open with, set when the analytics container drills through. */
  initialFilters?: Partial<ClaimFilterState>;
}

const PAGE_SIZE = 10;

/** Filter values sent to the API stay English; only the labels are localised. */
const STATUS_VALUES = ["Open", "Under Review", "Reserve Set", "Closed"];
const PRODUCT_VALUES = [
  "Property & Equipment", "Motor Fleet", "General Liability",
  "Cyber", "Marine Cargo", "Employers Liability",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: `${t.space(2)} ${t.space(3)}`,
  border: `1px solid ${t.color.grey300}`,
  borderRadius: t.radius.sm,
  font: `${t.font.size.sm} ${t.font.family}`,
  color: t.color.grey900,
  background: t.color.white,
  boxSizing: "border-box",
};

const filterLabelStyle: React.CSSProperties = {
  display: "block",
  font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
  color: t.color.grey700,
  marginBottom: t.space(1),
};

/**
 * Claims list - Figure 3 / Epic 3.
 *
 * Columns are resolved at runtime from the Exhibit 5 field registry, and their labels
 * come from the registry's label_token resolved against the active locale (NFR-43,
 * NFR-45). "Columns to Show" layers a per-session view preference on top of the
 * registry defaults without mutating them.
 */
export function ClaimsListScreen({
  nav, initialTab = "submitted", initialFilters,
}: ClaimsListScreenProps) {
  const { locale } = useApi();
  const { t: tr } = useI18n();
  const ent = useEntitlements();
  const registry = useFieldRegistry();

  const [tab, setTab] = React.useState<"submitted" | "drafts">(initialTab);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" }>({
    key: "date_of_loss", dir: "desc",
  });

  // All eleven criteria live in one object so the list query, the export and a saved
  // view describe the filter set identically.
  const resetPage = React.useCallback(() => setPage(1), []);
  const ctrl = useClaimFilters(resetPage, initialFilters);
  const { filters, applied } = ctrl;

  const pins = usePins();

  // Option lists come from the API, scoped to the caller's own claims (BR-001), so a
  // user is never offered a filter value that would return nothing.
  const { data: options } = useResource<FilterOptions>(
    (api) => api.get("/claims-filter-options"),
    []
  );

  const [showColPicker, setShowColPicker] = React.useState(false);
  const [hiddenCols, setHiddenCols] = React.useState<Set<string>>(new Set());
  const colPickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showColPicker) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowColPicker(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showColPicker]);

  // `applied` is the debounced copy, so typing does not fire a request per keystroke.
  const appliedQuery = React.useMemo(() => toQuery(applied), [applied]);

  const { data, loading, error, reload } = useResource<ClaimsListResponse>(
    (api) =>
      api.get("/claims", {
        ...appliedQuery,
        tab,
        page, page_size: PAGE_SIZE,
        sort: sort.key, dir: sort.dir,
      }),
    [tab, JSON.stringify(appliedQuery), page, sort.key, sort.dir]
  );

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Columns built from the field registry, labelled from the locale bundle. ──
  const allColumns = React.useMemo(() => {
    return registry.listFields.map((f) => ({
      key: f.field_key,
      label: tr(f.label_token),
      sortable: true,
      align: (f.value_type === "money" || f.value_type === "number" ? "right" : "left") as
        "left" | "right",
      render: (row: ClaimListRow) => {
        const raw = row[f.field_key];

        // PII masking driven by the registry flag plus the caller's privilege.
        if (f.is_pii && !ent.canViewPii) {
          return <span title={tr("list.masked_hint")}>{maskPii(raw)}</span>;
        }
        if (f.field_key === "aon_claim_id") {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); nav.toDetail(String(raw)); }}
              dir="ltr"
              style={{
                background: "none", border: "none", padding: 0,
                cursor: "pointer", fontSize: "inherit",
                fontFamily: t.font.mono, fontWeight: t.font.weight.semibold,
                color: t.color.teal700, textDecoration: "underline",
              }}
            >
              {String(raw)}
            </button>
          );
        }
        if (f.value_type === "status") {
          return (
            <span style={{
              display: "inline-flex", alignItems: "center",
              background: t.color.teal050, color: t.color.teal700,
              borderRadius: t.radius.pill, padding: "2px 8px",
              font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
              whiteSpace: "nowrap",
            }}>
              {translateValue(tr, "status", String(raw))}
              {row.sub_status ? ` · ${row.sub_status}` : ""}
            </span>
          );
        }
        if (f.field_key === "global_product") {
          return translateValue(tr, "product", String(raw));
        }
        if (f.field_key === "claim_type") {
          return translateValue(tr, "claim_type", String(raw));
        }
        if (f.value_type === "money") {
          return money(Number(raw ?? 0), row.currency_code, locale);
        }
        if (f.value_type === "date") {
          return date(raw as string, locale);
        }
        return String(raw ?? tr("common.dash"));
      },
    }));
  }, [registry.listFields, ent.canViewPii, locale, tr, nav]);

  const visibleColumns = allColumns.filter((c) => !hiddenCols.has(c.key));

  // The Drafts tab shows saved wizard state, not claim records, so it renders its
  // own panel rather than the registry-driven table.
  const isDrafts = tab === "drafts";

  const toggleSort = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  return (
    <div>
      {/* Page heading */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: t.space(5), flexWrap: "wrap", gap: t.space(3),
      }}>
        <div>
          <button
            onClick={nav.toLanding}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              font: `${t.font.size.sm} ${t.font.family}`, color: t.color.teal700,
              marginBottom: t.space(1),
            }}
          >
            &larr; {tr("list.back_overview")}
          </button>
          <h1 style={{
            margin: 0,
            font: `${t.font.weight.bold} ${t.font.size.xxl} ${t.font.family}`,
            color: t.color.navy900, letterSpacing: "-0.4px",
          }}>
            {tr("list.title")}
          </h1>
          <p style={{
            margin: `${t.space(1)} 0 0`,
            font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
          }}>
            {isDrafts ? tr("drafts.subtitle") : tr("list.subtitle", { count: total })}
          </p>
        </div>
        {!isDrafts && (
          <ExportMenu
            filters={filters}
            tab={tab}
            sort={sort}
            allowed={ent.canExport}
            totalRows={total}
          />
        )}
      </div>

      <div style={{
        background: t.color.white, border: `1px solid ${t.color.grey200}`,
        borderRadius: t.radius.lg, overflow: "hidden", boxShadow: t.shadow.sm,
      }}>
        {/* Filter row. Hidden on Drafts: search, status and product describe
            submitted claims, none of which a half-finished intake has yet. */}
        <div style={{
          display: isDrafts ? "none" : "flex",
          gap: t.space(3), padding: `${t.space(4)} ${t.space(5)}`,
          borderBottom: `1px solid ${t.color.grey200}`,
          flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <div style={{ flex: "2 1 220px" }}>
            <label style={filterLabelStyle} htmlFor="claims-search">
              {tr("common.search")}
            </label>
            <input
              id="claims-search"
              value={filters.q}
              onChange={(e) => ctrl.set("q", e.target.value)}
              placeholder={tr("list.search_placeholder")}
              style={inputStyle}
            />
          </div>

          <div style={{ flex: "1 1 170px" }}>
            <label style={filterLabelStyle} htmlFor="claims-status">
              {tr("list.filter_status")}
            </label>
            <select
              id="claims-status"
              value={filters.status}
              onChange={(e) => ctrl.set("status", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.all_statuses")}</option>
              {(options?.status ?? STATUS_VALUES).map((v) => (
                <option key={v} value={v}>{translateValue(tr, "status", v)}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 170px" }}>
            <label style={filterLabelStyle} htmlFor="claims-product">
              {tr("list.filter_product")}
            </label>
            <select
              id="claims-product"
              value={filters.product}
              onChange={(e) => ctrl.set("product", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.all_products")}</option>
              {(options?.product ?? PRODUCT_VALUES).map((v) => (
                <option key={v} value={v}>{translateValue(tr, "product", v)}</option>
              ))}
            </select>
          </div>

          {/* Columns to Show */}
          <div style={{ flex: "0 0 auto", position: "relative" }} ref={colPickerRef}>
            <span style={filterLabelStyle}>{tr("list.columns_to_show")}</span>
            <button
              onClick={() => setShowColPicker((v) => !v)}
              aria-expanded={showColPicker}
              aria-haspopup="true"
              style={{
                ...inputStyle,
                width: "auto",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: t.space(2),
                whiteSpace: "nowrap", color: t.color.grey700,
              }}
            >
              {tr("list.columns_count", { shown: visibleColumns.length, total: allColumns.length })}
              <span aria-hidden="true" style={{ fontSize: 9 }}>&#9660;</span>
            </button>
            {showColPicker && (
              <div
                role="group"
                aria-label={tr("list.columns_to_show")}
                style={{
                  position: "absolute", top: "calc(100% + 4px)", insetInlineEnd: 0,
                  background: t.color.white, border: `1px solid ${t.color.grey200}`,
                  borderRadius: t.radius.md, padding: t.space(2),
                  zIndex: 50, minWidth: 230, maxHeight: 340, overflowY: "auto",
                  boxShadow: t.shadow.lg,
                }}
              >
                {allColumns.map((col) => (
                  <label key={col.key} style={{
                    display: "flex", alignItems: "center", gap: t.space(2),
                    padding: `${t.space(1.5)} ${t.space(2)}`, cursor: "pointer",
                    font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey700,
                    borderRadius: t.radius.sm,
                  }}>
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(col.key)}
                      onChange={(e) => {
                        setHiddenCols((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        });
                      }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Advanced criteria + saved views. Both describe submitted claims, so they
            are hidden on Drafts for the same reason the filter row is. */}
        {!isDrafts && (
          <>
            <AdvancedFilters
              ctrl={ctrl}
              options={options ?? null}
              inputStyle={inputStyle}
              labelStyle={filterLabelStyle}
            />
            <SavedViewsBar ctrl={ctrl} />
          </>
        )}

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: `1px solid ${t.color.grey200}`,
          padding: `0 ${t.space(5)}`,
        }}>
          {([
            { id: "submitted", label: tr("list.tab_submitted") },
            { id: "drafts", label: tr("list.tab_drafts") },
          ] as const).map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => { setTab(id); setPage(1); }}
                aria-current={active ? "page" : undefined}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: `${t.space(3)} ${t.space(4)}`,
                  font: `${active ? t.font.weight.semibold : t.font.weight.regular} ${t.font.size.md} ${t.font.family}`,
                  color: active ? t.color.navy900 : t.color.grey500,
                  borderBottom: `2px solid ${active ? t.color.teal600 : "transparent"}`,
                  marginBottom: -1, whiteSpace: "nowrap",
                  textTransform: "uppercase", letterSpacing: "0.4px",
                  fontSize: t.font.size.sm,
                }}
              >
                {label}
                {/* The count comes from the claims query, which the Drafts tab
                    does not drive - so it is only meaningful on Submitted. */}
                {active && id === "submitted" && total > 0 && (
                  <span style={{ marginInlineStart: t.space(1.5), color: t.color.grey500 }}>
                    ({total})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isDrafts ? (
          <DraftsPanel onResume={(draftId) => nav.toFnol(draftId)} />
        ) : error ? (
          <div style={{ padding: t.space(6) }}>
            <ErrorState message={error.message} detail={error.detail} onRetry={reload} />
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%", borderCollapse: "collapse",
                font: `${t.font.size.sm} ${t.font.family}`,
              }}>
                <thead>
                  <tr style={{ background: t.color.grey050 }}>
                    {/* Pin column. Unlabelled by design - a header for a star column
                        costs more width than it explains, and each button carries its
                        own accessible name. */}
                    <th
                      scope="col"
                      style={{
                        width: 36, padding: `${t.space(2.5)} 0 ${t.space(2.5)} ${t.space(4)}`,
                        borderBottom: `1px solid ${t.color.grey200}`,
                      }}
                    >
                      <span style={{
                        position: "absolute", width: 1, height: 1,
                        overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
                      }}>
                        {tr("pins.pinned")}
                      </span>
                    </th>
                    {visibleColumns.map((col) => {
                      const isSorted = sort.key === col.key;
                      return (
                        <th
                          key={col.key}
                          aria-sort={isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                          style={{
                            padding: 0, textAlign: col.align,
                            borderBottom: `1px solid ${t.color.grey200}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            onClick={() => toggleSort(col.key)}
                            style={{
                              background: "none", border: "none", width: "100%",
                              padding: `${t.space(2.5)} ${t.space(4)}`,
                              cursor: "pointer", textAlign: col.align,
                              font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
                              color: isSorted ? t.color.navy900 : t.color.grey500,
                              textTransform: "uppercase", letterSpacing: "0.4px",
                            }}
                          >
                            {col.label}
                            <span aria-hidden="true" style={{ marginInlineStart: 4, opacity: isSorted ? 1 : 0.35 }}>
                              {isSorted ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading || registry.loading ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} style={{ padding: t.space(8), textAlign: "center" }}>
                        <Spinner label={tr("common.loading")} />
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} style={{
                        padding: t.space(8), textAlign: "center", color: t.color.grey500,
                      }}>
                        {tab === "drafts" ? tr("list.empty_drafts") : tr("list.empty_submitted")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <ClaimRow
                        key={row.aon_claim_id}
                        row={row}
                        columns={visibleColumns}
                        onOpen={() => nav.toDetail(row.aon_claim_id)}
                        pinned={pins.isPinned(row.aon_claim_id)}
                        onTogglePin={pins.toggle}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: `${t.space(2.5)} ${t.space(5)}`, gap: t.space(3),
              borderTop: `1px solid ${t.color.grey200}`, background: t.color.grey050,
              font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
            }}>
              <span>
                {total === 0
                  ? tr("common.no_results")
                  : tr("common.showing_range", {
                      from: (page - 1) * PAGE_SIZE + 1,
                      to: Math.min(page * PAGE_SIZE, total),
                      total,
                    })}
              </span>
              <span style={{ display: "flex", gap: t.space(2), alignItems: "center" }}>
                <Button size="sm" variant="secondary" disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}>
                  &larr; {tr("common.previous")}
                </Button>
                <span style={{ fontFamily: t.font.mono }} dir="ltr">{page} / {pages}</span>
                <Button size="sm" variant="secondary" disabled={page >= pages}
                        onClick={() => setPage((p) => p + 1)}>
                  {tr("common.next")} &rarr;
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClaimRow({
  row, columns, onOpen, pinned, onTogglePin,
}: {
  row: ClaimListRow;
  columns: Array<{ key: string; align: "left" | "right"; render: (r: ClaimListRow) => React.ReactNode }>;
  onOpen: () => void;
  pinned: boolean;
  onTogglePin: (claimId: string) => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <tr
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: `1px solid ${t.color.grey100}`,
        background: hovered ? t.color.grey050 : undefined,
        cursor: "pointer",
      }}
    >
      <td style={{ padding: `${t.space(2)} 0 ${t.space(2)} ${t.space(4)}`, verticalAlign: "middle" }}>
        <PinButton claimId={row.aon_claim_id} pinned={pinned} onToggle={onTogglePin} />
      </td>
      {columns.map((col) => (
        <td key={col.key} style={{
          padding: `${t.space(2.5)} ${t.space(4)}`,
          textAlign: col.align, verticalAlign: "middle",
          color: t.color.grey700,
        }}>
          {col.render(row)}
        </td>
      ))}
    </tr>
  );
}
