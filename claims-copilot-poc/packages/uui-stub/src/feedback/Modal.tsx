import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";
import { Button } from "../primitives/Button";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, footer, children, width = 560 }: ModalProps) {
  const tr = useT();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,31,66,.45)",
        display: "grid", placeItems: "center", zIndex: 1000, padding: t.space(4),
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          background: t.color.white, borderRadius: t.radius.lg,
          boxShadow: t.shadow.lg, width, maxWidth: "100%", maxHeight: "88vh",
          display: "flex", flexDirection: "column", outline: "none",
        }}
      >
        <header style={{
          padding: `${t.space(3.5)} ${t.space(4)}`,
          borderBottom: `1px solid ${t.color.grey200}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 style={{
            margin: 0, font: `${t.font.weight.semibold} ${t.font.size.lg} ${t.font.family}`,
            color: t.color.navy700,
          }}>{title}</h2>
          <Button variant="ghost" size="sm" aria-label={tr("uui.close_dialog")} onClick={onClose}>&#10005;</Button>
        </header>
        <div style={{ padding: t.space(4), overflowY: "auto" }}>{children}</div>
        {footer && (
          <footer style={{
            padding: `${t.space(3)} ${t.space(4)}`,
            borderTop: `1px solid ${t.color.grey200}`, background: t.color.grey050,
            display: "flex", justifyContent: "flex-end", gap: t.space(2),
          }}>{footer}</footer>
        )}
      </div>
    </div>
  );
}
