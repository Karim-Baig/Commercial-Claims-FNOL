import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      textAlign: "center", padding: `${t.space(10)} ${t.space(4)}`,
      color: t.color.grey500, font: `${t.font.size.md} ${t.font.family}`,
    }}>
      <h3 style={{
        margin: 0, font: `${t.font.weight.semibold} ${t.font.size.lg} ${t.font.family}`,
        color: t.color.navy700,
      }}>{title}</h3>
      {description && <p style={{ maxWidth: 420, margin: `${t.space(2)} auto 0` }}>{description}</p>}
      {action && <div style={{ marginTop: t.space(4) }}>{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  detail?: string;
}

export function ErrorState({ title, message, onRetry, detail }: ErrorStateProps) {
  const tr = useT();
  return (
    <div role="alert" style={{
      textAlign: "center", padding: `${t.space(9)} ${t.space(4)}`,
      font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey700,
    }}>
      <h3 style={{
        margin: 0, font: `${t.font.weight.semibold} ${t.font.size.lg} ${t.font.family}`,
        color: t.color.red500,
      }}>{title ?? tr("uui.error_title")}</h3>
      {/* NFR-41: plain language, no technical detail surfaced to the user. */}
      <p style={{ maxWidth: 460, margin: `${t.space(2)} auto 0` }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{
          marginTop: t.space(4), padding: "8px 16px", cursor: "pointer",
          background: t.color.navy700, color: t.color.white, border: "none",
          borderRadius: t.radius.md, font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
        }}>{tr("common.try_again")}</button>
      )}
      {detail && (
        <details style={{ marginTop: t.space(4), textAlign: "left", maxWidth: 460, margin: "16px auto 0" }}>
          <summary style={{ cursor: "pointer", font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
            {tr("uui.tech_detail_support")}
          </summary>
          <pre style={{
            font: `${t.font.size.xs} ${t.font.mono}`, background: t.color.grey100,
            padding: t.space(2), borderRadius: t.radius.sm, overflowX: "auto",
          }}>{detail}</pre>
        </details>
      )}
    </div>
  );
}
