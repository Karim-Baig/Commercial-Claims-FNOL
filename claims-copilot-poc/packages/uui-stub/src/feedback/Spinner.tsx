import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export function Spinner({ label, size = 20 }: { label?: string; size?: number }) {
  const tr = useT();
  const text = label ?? tr("common.loading");
  return (
    <div role="status" aria-live="polite" style={{
      display: "inline-flex", alignItems: "center", gap: t.space(2),
      font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
    }}>
      <span
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: "50%",
          border: `2px solid ${t.color.grey200}`,
          borderTopColor: t.color.navy700,
          display: "inline-block",
          animation: "poc-spin .7s linear infinite",
        }}
      />
      <span>{text}</span>
      <style>{"@keyframes poc-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
