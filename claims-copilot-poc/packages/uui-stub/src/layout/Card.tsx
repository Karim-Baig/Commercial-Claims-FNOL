import React from "react";
import { tokens as t } from "../tokens";

export interface CardProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({ title, action, padded = true, children, style }: CardProps) {
  return (
    <section
      style={{
        background: t.color.white,
        border: `1px solid ${t.color.grey200}`,
        borderRadius: t.radius.lg,
        boxShadow: t.shadow.sm,
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: t.space(3), padding: `${t.space(3)} ${t.space(4)}`,
            borderBottom: `1px solid ${t.color.grey200}`, background: t.color.grey050,
          }}
        >
          <h3 style={{
            margin: 0, font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
            color: t.color.navy700,
          }}>{title}</h3>
          {action}
        </header>
      )}
      <div style={{ padding: padded ? t.space(4) : 0 }}>{children}</div>
    </section>
  );
}

export interface GridProps {
  cols?: number;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Grid({ cols = 2, gap = 4, children, style }: GridProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(${Math.floor(1000 / cols)}px, 1fr))`,
      gap: t.space(gap),
      ...style,
    }}>{children}</div>
  );
}
