import React from "react";
import { tokens as t } from "../tokens";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        listStyle: "none", margin: 0, padding: 0,
        gap: t.space(1), font: `${t.font.size.sm} ${t.font.family}`,
      }}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: t.space(1) }}>
              {i > 0 && (
                <span aria-hidden="true" style={{ color: t.color.grey300, userSelect: "none" }}>
                  /
                </span>
              )}
              {isLast || !item.onClick ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  style={{ color: isLast ? t.color.grey700 : t.color.navy700 }}
                >
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: t.color.navy700, font: `${t.font.size.sm} ${t.font.family}`,
                    textDecoration: "underline",
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
