import * as React from "react";
import {
  tokens as t, Button, Card, PageHeader, Badge, Spinner, ErrorState, EmptyState,
  Banner, useI18n,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import type { ClaimsNav } from "../../ClaimsApp";
import { NotificationPreferences } from "./NotificationPreferences";
import { DeliveryLedger } from "./DeliveryLedger";

interface Notification {
  notification_id: string;
  event_type: string;
  claim_id: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  items: Notification[];
  unread_count: number;
}

const EVENT_TONE: Record<string, string> = {
  reserve_set: t.color.blue600,
  claim_closed: t.color.green600,
  document_requested: t.color.amber600,
  fnol_acknowledged: t.color.green600,
  fnol_queued: t.color.navy700,
  status_changed: t.color.grey600,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationCentreScreen({ nav }: { nav: ClaimsNav }) {
  const { t: tr } = useI18n();
  const api = useApi();
  const [showPrefs, setShowPrefs] = React.useState(false);
  const { data, loading, error, reload } = useResource<NotificationsResponse>(
    (a) => a.get("/notifications"),
    []
  );

  // Both endpoints are PATCH. They were previously called with POST, which meant
  // every request 405'd and the swallowed rejection made it look like a no-op.
  async function markAllRead() {
    await api.patch("/notifications/read-all");
    reload();
  }

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    reload();
  }

  if (loading) return (
    <div style={{ padding: t.space(10), display: "grid", placeItems: "center" }}>
      <Spinner label="Loading notifications" />
    </div>
  );

  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
        breadcrumb={
          <Button variant="ghost" size="sm" onClick={nav.toLanding}>
            &larr; Overview
          </Button>
        }
        actions={
          <span style={{ display: "inline-flex", gap: t.space(2) }}>
            {unread > 0 && (
              <Button variant="secondary" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
            <Button
              variant={showPrefs ? "primary" : "secondary"}
              onClick={() => setShowPrefs((v) => !v)}
              aria-expanded={showPrefs}
            >
              {tr("notif.prefs.open")}
            </Button>
          </span>
        }
      />

      {/* Epic 8: the rules that decided which of these arrived, and where else they
          were routed. Kept on the same screen as the results so the cause and the
          effect are visible together. */}
      {showPrefs && (
        <div style={{ marginBottom: t.space(4) }}>
          <NotificationPreferences onClose={() => setShowPrefs(false)} />
          <div style={{ marginTop: t.space(3) }}>
            <DeliveryLedger />
          </div>
        </div>
      )}

      {items.length === 0 && (
        <Card>
          <EmptyState title="No notifications" description="You have no notifications yet." />
        </Card>
      )}

      {items.map((n) => (
        <div
          key={n.notification_id}
          style={{
            background: n.is_read ? t.color.white : t.color.blue050,
            border: `1px solid ${n.is_read ? t.color.grey200 : t.color.blue600 + "33"}`,
            borderRadius: t.radius.md, padding: t.space(3.5),
            marginBottom: t.space(2),
            display: "flex", gap: t.space(3), alignItems: "flex-start",
            cursor: n.claim_id ? "pointer" : "default",
          }}
          onClick={() => {
            if (n.claim_id) {
              markRead(n.notification_id);
              nav.toDetail(n.claim_id);
            }
          }}
        >
          {/* Unread dot */}
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 5,
            background: n.is_read ? t.color.grey300 : t.color.navy700,
          }} />

          <div style={{ flex: 1 }}>
            <div style={{
              font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
              color: EVENT_TONE[n.event_type] ?? t.color.grey900,
              marginBottom: 2,
            }}>
              {n.title}
            </div>
            {n.body && (
              <div style={{ font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey600 }}>
                {n.body}
              </div>
            )}
            <div style={{
              marginTop: t.space(1.5), font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey400,
              display: "flex", gap: t.space(2), alignItems: "center",
            }}>
              <span>{timeAgo(n.created_at)}</span>
              {n.claim_id && (
                <span style={{
                  background: t.color.navy700, color: t.color.white,
                  borderRadius: t.radius.pill, padding: "1px 7px",
                  font: `${t.font.weight.semibold} 10px ${t.font.mono}`,
                }}>
                  {n.claim_id} →
                </span>
              )}
            </div>
          </div>

          {!n.is_read && (
            <button
              type="button"
              aria-label="Mark as read"
              onClick={(e) => { e.stopPropagation(); markRead(n.notification_id); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: t.color.grey400, font: `${t.font.size.xs} ${t.font.family}`,
                flexShrink: 0,
              }}
            >
              Mark read
            </button>
          )}
        </div>
      ))}

      <Banner tone="info" title="Deep link (DR-3.5, F-MER-04)">
        Every notification carries a direct link to the relevant claim. Clicking a notification
        opens the claim detail directly. When accessed via email, the PKCE state round-trip
        restores the target path after authentication.
      </Banner>
    </>
  );
}
