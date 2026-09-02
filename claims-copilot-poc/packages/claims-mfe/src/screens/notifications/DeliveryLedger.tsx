import * as React from "react";
import { tokens as t, Card, Banner, Spinner, useI18n } from "@poc/uui-stub";
import { useResource } from "../../api/ApiContext";
import { useBrand } from "../../branding/BrandProvider";
import { dateTimeInZone } from "../../format";

/**
 * Channel routing ledger — Epic 8 (p. 64).
 *
 * This is the surface that makes the Epic 8 boundary legible rather than leaving it as
 * a caveat in a document. Each row is a channel the rules engine selected for an event,
 * with what became of it:
 *
 *   delivered        - the in-app channel, which this environment can serve;
 *   pending_provider - correctly routed to email or SMS, waiting on a transport that
 *                      has not been chosen, contracted or consent-registered yet.
 *
 * Showing the routing decision is what proves the rules engine ran. Without it, a
 * suppressed in-app notification and a broken one look identical.
 *
 * Timestamps use the programme timezone from the resolved brand rather than the
 * reader's browser (Epic 6), so two people comparing this ledger across offices are
 * reading the same clock.
 */
interface Delivery {
  delivery_id: string;
  notification_id: string;
  channel: string;
  state: string;
  detail: string | null;
  created_at: string;
  event_type: string;
  title: string;
  claim_id: string | null;
}

interface LedgerResponse {
  items: Delivery[];
  pending_provider_count: number;
}

const STATE_TONE: Record<string, string> = {
  delivered: t.color.green600,
  pending_provider: t.color.amber600,
};

export function DeliveryLedger() {
  const { t: tr, locale } = useI18n();
  const brand = useBrand();
  const { data, loading } = useResource<LedgerResponse>((a) => a.get("/notifications/deliveries"), []);

  if (loading) {
    return (
      <Card padded>
        <div style={{ padding: t.space(5), textAlign: "center" }}>
          <Spinner label={tr("common.loading")} />
        </div>
      </Card>
    );
  }

  const items = data?.items ?? [];
  const pending = data?.pending_provider_count ?? 0;

  return (
    <Card padded title={tr("notif.deliveries.title")}>
      {pending > 0 && (
        <Banner tone="info" title={tr("notif.deliveries.title")}>
          {tr("notif.deliveries.pending_banner", { count: pending })}
        </Banner>
      )}

      {items.length === 0 ? (
        <p style={{
          margin: `${t.space(3)} 0 0`,
          font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
        }}>
          {tr("notif.deliveries.none")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: `${t.space(3)} 0 0`, padding: 0 }}>
          {items.slice(0, 25).map((d) => (
            <li
              key={d.delivery_id}
              style={{
                display: "flex", gap: t.space(3), alignItems: "baseline",
                padding: `${t.space(2)} 0`,
                borderBottom: `1px solid ${t.color.grey100}`,
                font: `${t.font.size.sm} ${t.font.family}`,
              }}
            >
              <span style={{
                minWidth: 64, textTransform: "uppercase", letterSpacing: "0.4px",
                font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
                color: t.color.grey500,
              }}>
                {tr(`notif.prefs.channel.${d.channel}`)}
              </span>

              <span style={{ flex: 1, color: t.color.grey900 }}>
                {d.title}
                {d.detail && (
                  <span style={{
                    display: "block",
                    font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                  }}>
                    {d.detail}
                  </span>
                )}
              </span>

              <span style={{
                color: STATE_TONE[d.state] ?? t.color.grey500,
                font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
                whiteSpace: "nowrap",
              }}>
                {tr(`notif.state.${d.state}`)}
              </span>

              <span style={{
                color: t.color.grey400, whiteSpace: "nowrap",
                font: `${t.font.size.xs} ${t.font.family}`,
              }}>
                {dateTimeInZone(d.created_at, locale, brand.timezone, brand.timezone_label)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
