import React from "react";
import { tokens as t } from "../tokens";
import type { BannerTone } from "./Banner";

export interface ToastProps {
  message: string;
  tone?: BannerTone;
  onDismiss?: () => void;
  /** Auto-dismiss after ms (default 4000, 0 = never) */
  duration?: number;
}

const toneStyle: Record<BannerTone, { bg: string; fg: string; bar: string }> = {
  info:    { bg: t.color.blue050,  fg: t.color.blue600,  bar: t.color.blue600  },
  success: { bg: t.color.green050, fg: t.color.green600, bar: t.color.green600 },
  warning: { bg: t.color.amber050, fg: t.color.amber600, bar: t.color.amber600 },
  error:   { bg: t.color.red050,   fg: t.color.red500,   bar: t.color.red500   },
};

export function Toast({ message, tone = "success", onDismiss, duration = 4000 }: ToastProps) {
  React.useEffect(() => {
    if (duration && onDismiss) {
      const id = setTimeout(onDismiss, duration);
      return () => clearTimeout(id);
    }
  }, [duration, onDismiss]);

  const s = toneStyle[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", bottom: t.space(6), right: t.space(6), zIndex: 9999,
        background: s.bg, borderLeft: `4px solid ${s.bar}`,
        borderRadius: t.radius.md, boxShadow: t.shadow.md,
        padding: `${t.space(3)} ${t.space(4)}`,
        display: "flex", alignItems: "center", gap: t.space(3),
        font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey900,
        maxWidth: 420, minWidth: 260,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: s.fg, font: `${t.font.weight.bold} 16px ${t.font.family}`,
            lineHeight: 1, padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Portal-ready toast container — mount once at app root. */
export function ToastContainer({ toasts, onDismiss }: {
  toasts: Array<{ id: string; message: string; tone?: BannerTone }>;
  onDismiss: (id: string) => void;
}) {
  return (
    <div style={{ position: "fixed", bottom: t.space(6), right: t.space(6), zIndex: 9999 }}>
      {toasts.map((toast, i) => (
        <div key={toast.id} style={{ marginTop: i > 0 ? t.space(2) : 0 }}>
          <Toast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => onDismiss(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
