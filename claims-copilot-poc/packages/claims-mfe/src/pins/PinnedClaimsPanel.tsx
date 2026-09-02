import * as React from "react";
import { tokens as t, Button, Card, useI18n } from "@poc/uui-stub";
import { useApi } from "../api/ApiContext";
import { money, date as fmtDate } from "../format";
import { PinButton, usePins } from "./usePins";
import type { ClaimsNav } from "../ClaimsApp";

/**
 * Pinned claims on the dashboard — Epic 1 (p. 61).
 *
 * Hidden entirely when nothing is pinned. An empty "you have no pinned claims" card
 * occupying prime dashboard space is worse than the feature not being there: the
 * affordance to create a pin lives on the claims list, not here.
 *
 * `unavailable_count` is surfaced rather than swallowed. If a pin stops resolving
 * because the user's scope changed or the claim became restricted, saying so is more
 * honest than silently shortening the list and leaving them to wonder.
 */
export function PinnedClaimsPanel({ nav }: { nav: ClaimsNav }) {
  const { t: tr } = useI18n();
  const { locale } = useApi();
  const pins = usePins();

  if (pins.loading || (pins.items.length === 0 && pins.unavailableCount === 0)) {
    return null;
  }

  return (
    <Card padded title={tr("pins.panel_title")}>
      {pins.unavailableCount > 0 && (
        <p style={{
          margin: `0 0 ${t.space(2)}`,
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.amber600,
        }}>
          {tr("pins.unavailable", { count: pins.unavailableCount })}
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {pins.items.map((p) => (
          <li
            key={p.claim_id}
            style={{
              display: "flex", alignItems: "center", gap: t.space(3),
              padding: `${t.space(2)} 0`,
              borderBottom: `1px solid ${t.color.grey100}`,
            }}
          >
            <PinButton claimId={p.claim_id} pinned onToggle={pins.toggle} />

            <button
              onClick={() => nav.toDetail(p.claim_id)}
              dir="ltr"
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.mono}`,
                color: t.color.teal700, textDecoration: "underline",
              }}
            >
              {p.aon_claim_id}
            </button>

            <span style={{
              flex: 1, minWidth: 0, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
              font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey700,
            }}>
              {p.note || p.loss_description}
            </span>

            <span style={{
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
              whiteSpace: "nowrap",
            }}>
              {fmtDate(p.date_of_loss, locale)}
            </span>

            <span style={{
              font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
              color: t.color.navy900, whiteSpace: "nowrap",
            }}>
              {money(p.gross_incurred, p.currency_code, locale)}
            </span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: t.space(3) }}>
        <Button size="sm" variant="ghost" onClick={() => nav.toList()}>
          {tr("pins.view_all")}
        </Button>
      </div>
    </Card>
  );
}
