import React from "react";
import { tokens as t } from "../tokens";

export type BannerTone = "info" | "success" | "warning" | "error";

const tone: Record<BannerTone, { bg: string; fg: string; bar: string }> = {
  info: { bg: t.color.blue050, fg: t.color.blue600, bar: t.color.blue600 },
  success: { bg: t.color.green050, fg: t.color.green600, bar: t.color.green600 },
  warning: { bg: t.color.amber050, fg: t.color.amber600, bar: t.color.amber600 },
  error: { bg: t.color.red050, fg: t.color.red500, bar: t.color.red500 },
};

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Banner({ tone: tn = "info", title, children, action }: BannerProps) {
  const c = tone[tn];
  return (
    <div
      role={tn === "error" ? "alert" : "status"}
      style={{
        background: c.bg, borderLeft: `4px solid ${c.bar}`,
        borderRadius: t.radius.md, padding: `${t.space(3)} ${t.space(3.5)}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: t.space(3), font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey900,
      }}
    >
      <div>
        {title && <strong style={{ color: c.fg, marginRight: 6 }}>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}
