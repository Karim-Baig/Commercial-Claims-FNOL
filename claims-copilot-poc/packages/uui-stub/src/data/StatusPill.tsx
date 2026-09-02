import React from "react";
import { tokens as t } from "../tokens";

export type StatusTone = "open" | "review" | "closed" | "draft" | "neutral";

const tone: Record<StatusTone, { bg: string; fg: string }> = {
  open: { bg: t.color.blue050, fg: t.color.blue600 },
  review: { bg: t.color.amber050, fg: t.color.amber600 },
  closed: { bg: t.color.green050, fg: t.color.green600 },
  draft: { bg: t.color.grey100, fg: t.color.grey700 },
  neutral: { bg: t.color.grey100, fg: t.color.grey700 },
};

export function toneForStatus(status: string): StatusTone {
  const s = (status || "").toLowerCase();
  if (s.includes("closed")) return "closed";
  if (s.includes("review") || s.includes("progress")) return "review";
  if (s.includes("draft")) return "draft";
  if (s.includes("open") || s.includes("reported")) return "open";
  if (s.includes("reserve")) return "review";
  return "neutral";
}

export interface StatusPillProps {
  /** Display text. Already localised by the caller. */
  status: string;
  subStatus?: string | null;
  /**
   * Raw, untranslated status used only to pick the colour, or an explicit tone.
   *
   * Colour derivation cannot run on translated text, so callers that localise
   * `status` pass the original English value (or a tone) here. Without this the pill
   * would fall back to neutral grey in every language except English.
   */
  tone?: StatusTone | string;
}

export function StatusPill({ status, subStatus, tone: toneProp }: StatusPillProps) {
  const key: StatusTone =
    toneProp && toneProp in tone
      ? (toneProp as StatusTone)
      : toneForStatus(toneProp ?? status);
  const c = tone[key];

  return (
    <span
      title={subStatus ? `${status} — ${subStatus}` : status}
      style={{
        display: "inline-block",
        background: c.bg, color: c.fg,
        border: `1px solid ${c.fg}22`,
        borderRadius: t.radius.pill,
        padding: "2px 9px",
        font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
