import * as React from "react";
import { tokens as t, Button, useI18n, translateValue } from "@poc/uui-stub";
import type { ClaimFilterState, FilterOptions, UseClaimFilters } from "./useClaimFilters";

/**
 * Collapsible advanced-criteria panel.
 *
 * Epic 3 (p. 62) names status, line of business, date range, adjuster and reserve
 * amount; Figure 3 (p. 16) adds sub-status and sub-product. The four criteria that fit
 * on one line stay in the always-visible row; the rest live here so the default view
 * is not a wall of controls.
 *
 * Option lists come from the API, not from a constant in this file. That keeps a user
 * from being offered a value that would return nothing, and means the option list
 * itself cannot reveal that data exists outside their scope (BR-001).
 */
export interface AdvancedFiltersProps {
  ctrl: UseClaimFilters;
  options: FilterOptions | null;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}

export function AdvancedFilters({
  ctrl, options, inputStyle, labelStyle,
}: AdvancedFiltersProps) {
  const { t: tr } = useI18n();
  const [open, setOpen] = React.useState(false);
  const { filters, set, clear } = ctrl;

  const panelId = React.useId();
  const badge = ctrl.advancedActiveCount;

  function opt(values: string[] | undefined, namespace?: string) {
    return (values ?? []).map((v) => (
      <option key={v} value={v}>
        {namespace ? translateValue(tr, namespace, v) : v}
      </option>
    ));
  }

  return (
    <div style={{
      borderBottom: `1px solid ${t.color.grey200}`,
      background: open ? t.color.grey050 : t.color.white,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: t.space(3), padding: `${t.space(2)} ${t.space(5)}`, flexWrap: "wrap",
      }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: t.space(2),
            font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
            color: t.color.teal700,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 9 }}>{open ? "▼" : "▶"}</span>
          {tr("list.advanced_search")}
          {badge > 0 && (
            <span style={{
              background: t.color.teal050, color: t.color.teal700,
              borderRadius: t.radius.pill, padding: "1px 7px",
              font: `${t.font.weight.bold} ${t.font.size.xs} ${t.font.family}`,
            }}>{badge}</span>
          )}
        </button>

        {ctrl.activeCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clear}>
            {tr("list.clear_filters", { count: ctrl.activeCount })}
          </Button>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          style={{
            display: "grid", gap: t.space(3),
            gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
            padding: `0 ${t.space(5)} ${t.space(4)}`,
          }}
        >
          <Field label={tr("list.filter_sub_status")} labelStyle={labelStyle}>
            <select
              value={filters.sub_status}
              onChange={(e) => set("sub_status", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.any")}</option>
              {opt(options?.sub_status)}
            </select>
          </Field>

          <Field label={tr("list.filter_product_category")} labelStyle={labelStyle}>
            <select
              value={filters.product_category}
              onChange={(e) => set("product_category", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.any")}</option>
              {opt(options?.product_category)}
            </select>
          </Field>

          <Field label={tr("field.aon_claim_lead")} labelStyle={labelStyle}>
            <select
              value={filters.adjuster}
              onChange={(e) => set("adjuster", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.any")}</option>
              {opt(options?.adjuster)}
            </select>
          </Field>

          <Field label={tr("detail.type")} labelStyle={labelStyle}>
            <select
              value={filters.claim_type}
              onChange={(e) => set("claim_type", e.target.value)}
              style={inputStyle}
            >
              <option value="">{tr("list.any")}</option>
              {opt(options?.claim_type, "claim_type")}
            </select>
          </Field>

          <Field label={tr("list.date_from")} labelStyle={labelStyle}>
            <input
              type="date"
              value={filters.date_from}
              min={options?.date_min ?? undefined}
              max={filters.date_to || (options?.date_max ?? undefined)}
              onChange={(e) => set("date_from", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label={tr("list.date_to")} labelStyle={labelStyle}>
            <input
              type="date"
              value={filters.date_to}
              min={filters.date_from || (options?.date_min ?? undefined)}
              max={options?.date_max ?? undefined}
              onChange={(e) => set("date_to", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label={tr("list.reserve_min")} labelStyle={labelStyle}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder={options ? String(Math.floor(options.reserve_min)) : ""}
              value={filters.reserve_min}
              onChange={(e) => set("reserve_min", e.target.value)}
              style={inputStyle}
              dir="ltr"
            />
          </Field>

          <Field label={tr("list.reserve_max")} labelStyle={labelStyle}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder={options ? String(Math.ceil(options.reserve_max)) : ""}
              value={filters.reserve_max}
              onChange={(e) => set("reserve_max", e.target.value)}
              style={inputStyle}
              dir="ltr"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label, labelStyle, children,
}: {
  label: string;
  labelStyle: React.CSSProperties;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
