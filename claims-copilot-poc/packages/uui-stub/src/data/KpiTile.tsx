import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export interface KpiTileProps {
  label: string;
  value: string;
  /** Year-on-year movement. Positive renders as an increase. */
  deltaPct?: number | null;
  deltaLabel?: string;
  footnote?: string;
  /** When true a rise is shown as unfavourable (e.g. outstanding claims). */
  riseIsAdverse?: boolean;
}

export function KpiTile({
  label, value, deltaPct, deltaLabel, footnote, riseIsAdverse,
}: KpiTileProps) {
  const tr = useT();
  const delta = deltaLabel ?? tr("kpi.yoy");
  const hasDelta = typeof deltaPct === "number";
  const up = hasDelta && deltaPct! >= 0;
  const adverse = riseIsAdverse ? up : !up;
  const color = !hasDelta ? t.color.grey500 : adverse ? t.color.red500 : t.color.green600;

  return (
    <div style={{
      background: t.color.white,
      border: `1px solid ${t.color.grey200}`,
      borderTop: `3px solid ${t.color.navy700}`,
      borderRadius: t.radius.md,
      padding: t.space(3.5),
      minWidth: 150,
      boxShadow: t.shadow.sm,
    }}>
      <div style={{
        font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
        color: t.color.grey500, textTransform: "uppercase", letterSpacing: ".5px",
        marginBottom: t.space(2), minHeight: 26,
      }}>{label}</div>

      <div style={{
        font: `${t.font.weight.bold} ${t.font.size.xl} ${t.font.family}`,
        color: t.color.navy900, lineHeight: 1.15,
      }}>{value}</div>

      {hasDelta && (
        <div style={{ marginTop: t.space(1.5), font: `${t.font.size.xs} ${t.font.family}`, color }}>
          <span aria-hidden="true">{up ? "\u25B2" : "\u25BC"}</span>{" "}
          {Math.abs(deltaPct!).toFixed(1)}% {delta}
          <span className="sr-only">
            {" "}
            {up ? tr("kpi.increase_yoy") : tr("kpi.decrease_yoy")}
          </span>
        </div>
      )}
      {footnote && (
        <div style={{
          marginTop: t.space(1.5),
          font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500,
        }}>{footnote}</div>
      )}
    </div>
  );
}
