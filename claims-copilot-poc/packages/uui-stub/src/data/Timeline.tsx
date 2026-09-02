import React from "react";
import { tokens as t } from "../tokens";

export interface TimelineStep {
  milestone: string;
  occurred_on?: string | null;
  complete: boolean;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol style={{
      listStyle: "none", margin: 0, padding: 0,
      display: "flex", gap: 0, flexWrap: "wrap",
    }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.milestone} style={{ display: "flex", alignItems: "flex-start", flex: last ? "0 0 auto" : 1, minWidth: 110 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 13, height: 13, borderRadius: "50%", flex: "0 0 auto",
                    background: s.complete ? t.color.navy700 : t.color.white,
                    border: `2px solid ${s.complete ? t.color.navy700 : t.color.grey300}`,
                  }}
                />
                {!last && (
                  <span aria-hidden="true" style={{
                    height: 2, flex: 1,
                    background: s.complete ? t.color.navy700 : t.color.grey200,
                  }} />
                )}
              </div>
              <div style={{ paddingTop: t.space(2), textAlign: "left", width: "100%" }}>
                <div style={{
                  font: `${s.complete ? t.font.weight.semibold : t.font.weight.regular} ${t.font.size.sm} ${t.font.family}`,
                  color: s.complete ? t.color.navy900 : t.color.grey500,
                }}>{s.milestone}</div>
                <div style={{ font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500 }}>
                  {s.occurred_on ?? "\u2014"}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
