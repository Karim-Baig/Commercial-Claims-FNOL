import React from "react";
import { tokens as t } from "../tokens";

export type BadgeTone = "default" | "info" | "success" | "warning" | "error";

const toneStyles: Record<BadgeTone, { bg: string; fg: string }> = {
  default: { bg: t.color.grey100, fg: t.color.grey700 },
  info:    { bg: t.color.blue050, fg: t.color.blue600 },
  success: { bg: t.color.green050, fg: t.color.green600 },
  warning: { bg: t.color.amber050, fg: t.color.amber600 },
  error:   { bg: t.color.red050, fg: t.color.red500 },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  count?: number;
}

export function Badge({ label, tone = "default", count }: BadgeProps) {
  const s = toneStyles[tone];
  const display = count !== undefined ? `${label} ${count}` : label;
  return (
    <span
      aria-label={display}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: s.bg, color: s.fg,
        borderRadius: t.radius.pill,
        padding: `2px ${t.space(1.5)}`,
        font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
        whiteSpace: "nowrap", lineHeight: 1.4,
      }}
    >
      {count !== undefined ? count : label}
    </span>
  );
}
