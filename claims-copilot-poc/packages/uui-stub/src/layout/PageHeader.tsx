import React from "react";
import { tokens as t } from "../tokens";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header style={{ marginBottom: t.space(5) }}>
      {breadcrumb && <div style={{ marginBottom: t.space(2) }}>{breadcrumb}</div>}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: t.space(4), flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            margin: 0, font: `${t.font.weight.semibold} ${t.font.size.xxl} ${t.font.family}`,
            color: t.color.navy900, letterSpacing: "-0.3px",
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              margin: `${t.space(1)} 0 0`,
              font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey500,
            }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: t.space(2) }}>{actions}</div>}
      </div>
    </header>
  );
}
