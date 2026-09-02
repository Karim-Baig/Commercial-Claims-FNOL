import React from "react";
import { tokens as t } from "../tokens";

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Zero-based index of the active step. */
  current: number;
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, current, onStepClick }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol style={{
        listStyle: "none", display: "flex", gap: 0, margin: 0, padding: 0, flexWrap: "wrap",
      }}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= current && Boolean(onStepClick);
          return (
            <li key={s.id} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? "0 0 auto" : 1 }}>
              <button
                type="button"
                disabled={!reachable}
                onClick={reachable ? () => onStepClick!(i) : undefined}
                aria-current={active ? "step" : undefined}
                style={{
                  all: "unset",
                  display: "inline-flex", alignItems: "center", gap: t.space(2),
                  cursor: reachable ? "pointer" : "default",
                  font: `${active ? t.font.weight.semibold : t.font.weight.regular} ${t.font.size.sm} ${t.font.family}`,
                  color: active ? t.color.navy900 : done ? t.color.navy500 : t.color.grey500,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    display: "grid", placeItems: "center",
                    background: done || active ? t.color.navy700 : t.color.white,
                    color: done || active ? t.color.white : t.color.grey500,
                    border: `1.5px solid ${done || active ? t.color.navy700 : t.color.grey300}`,
                    font: `${t.font.weight.semibold} 11px ${t.font.family}`,
                    flex: "0 0 auto",
                  }}
                >
                  {done ? "\u2713" : i + 1}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden="true" style={{
                  height: 2, flex: 1, minWidth: 16, margin: `0 ${t.space(2)}`,
                  background: done ? t.color.navy700 : t.color.grey200,
                }} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
