import React from "react";
import { tokens as t } from "../tokens";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ items, active, onChange }: TabsProps) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? (idx + 1) % items.length
      : (idx - 1 + items.length) % items.length;
    const id = items[next].id;
    onChange(id);
    refs.current[id]?.focus();
  }

  return (
    <div role="tablist" style={{
      display: "flex", gap: t.space(1), borderBottom: `1px solid ${t.color.grey200}`,
    }}>
      {items.map((it, i) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            ref={(el) => { refs.current[it.id] = el; }}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              padding: `${t.space(2)} ${t.space(3)}`,
              font: `${on ? t.font.weight.semibold : t.font.weight.regular} ${t.font.size.md} ${t.font.family}`,
              color: on ? t.color.navy700 : t.color.grey500,
              borderBottom: `2px solid ${on ? t.color.red500 : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span style={{ color: t.color.grey500, fontWeight: 400 }}> ({it.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
