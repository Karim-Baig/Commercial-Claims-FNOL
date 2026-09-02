import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

/** Groups related fields with an accessible legend. Used by the FNOL form engine. */
export interface FieldGroupProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  /** Marks a group rendered from configuration rather than code. */
  configDriven?: boolean;
}

export function FieldGroup({ title, hint, children, configDriven }: FieldGroupProps) {
  const tr = useT();
  return (
    <fieldset style={{
      border: `1px solid ${t.color.grey200}`,
      borderRadius: t.radius.md,
      padding: `${t.space(3)} ${t.space(4)} ${t.space(4)}`,
      margin: `0 0 ${t.space(4)}`,
      background: t.color.white,
    }}>
      <legend style={{
        font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
        color: t.color.navy700, padding: `0 ${t.space(2)}`,
        display: "inline-flex", alignItems: "center", gap: t.space(2),
      }}>
        {title}
        {configDriven && (
          <span
            title="Rendered from configuration, not code"
            style={{
              background: t.color.red050, color: t.color.red500,
              border: `1px solid ${t.color.red500}33`,
              borderRadius: t.radius.pill, padding: "1px 7px",
              font: `${t.font.weight.semibold} 10px ${t.font.family}`,
              textTransform: "uppercase", letterSpacing: ".4px",
            }}
          >{tr("uui.from_config")}</span>
        )}
      </legend>
      {hint && (
        <p style={{
          margin: `0 0 ${t.space(3)}`,
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>{hint}</p>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: t.space(3.5),
      }}>{children}</div>
    </fieldset>
  );
}

/** Read-only display pair, used for ODS/CCP-sourced policy fields. */
export function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{
        font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
        color: t.color.grey500, textTransform: "uppercase", letterSpacing: ".4px",
        marginBottom: 3,
      }}>{label}</div>
      <div style={{ font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey900 }}>
        {value ?? "\u2014"}
      </div>
    </div>
  );
}
