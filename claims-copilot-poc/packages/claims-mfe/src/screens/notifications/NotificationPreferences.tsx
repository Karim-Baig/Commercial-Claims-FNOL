import * as React from "react";
import { tokens as t, Button, Card, Banner, Spinner, useI18n } from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";

/**
 * Notification rules and channel preferences — Epic 8 (p. 64).
 *
 * A grid of event rows against channel columns. The events, the channels and the
 * defaults all arrive from `/preferences`, so shipping a new event type or enabling a
 * transport needs no change here.
 *
 * The honest part of this screen: a channel the environment has no transport for is
 * still switchable, because the *preference* is real and is recorded against the user.
 * It is labelled so nobody leaves the demo believing an SMS was sent. Suppressing the
 * control entirely would hide a delivered capability; leaving it unlabelled would
 * imply one that does not exist.
 */
type Rules = Record<string, Record<string, boolean>>;

interface EventMeta {
  event_type: string;
  label_token: string;
  defaults: Record<string, boolean>;
}

interface ChannelMeta {
  channel: string;
  available: boolean;
}

interface PreferencesResponse {
  kpi_order: string[];
  kpi_hidden: string[];
  notifications: Rules;
  notification_events: EventMeta[];
  notification_channels: ChannelMeta[];
  is_default?: boolean;
}

export function NotificationPreferences({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const { t: tr } = useI18n();

  const { data, loading, reload } = useResource<PreferencesResponse>(
    (a) => a.get("/preferences"),
    []
  );

  const [draft, setDraft] = React.useState<Rules | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Seed the editable copy once the server state arrives.
  React.useEffect(() => {
    if (data?.notifications) setDraft(data.notifications);
  }, [data]);

  const rules = draft ?? {};

  const toggle = (event: string, channel: string) => {
    setSaved(false);
    setDraft((prev) => ({
      ...(prev ?? {}),
      [event]: { ...(prev?.[event] ?? {}), [channel]: !prev?.[event]?.[channel] },
    }));
  };

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    try {
      await api.put("/preferences", {
        kpi_order: data.kpi_order,
        kpi_hidden: data.kpi_hidden,
        notifications: draft,
      });
      setSaved(true);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      await api.del("/preferences");
      setSaved(false);
      setDraft(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <Card padded>
        <div style={{ padding: t.space(6), textAlign: "center" }}>
          <Spinner label={tr("common.loading")} />
        </div>
      </Card>
    );
  }

  const channels = data.notification_channels;
  const unavailable = channels.filter((c) => !c.available).map((c) => c.channel);

  return (
    <Card padded title={tr("notif.prefs.title")}>
      <p style={{
        margin: `0 0 ${t.space(3)}`,
        font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey700,
      }}>
        {tr("notif.prefs.intro")}
      </p>

      {unavailable.length > 0 && (
        <Banner tone="warning" title={tr("notif.prefs.unavailable")}>
          {unavailable
            .map((c) => tr("notif.prefs.unavailable_hint", { channel: tr(`notif.prefs.channel.${c}`) }))
            .join(" ")}
        </Banner>
      )}

      <div style={{ overflowX: "auto", marginTop: t.space(3) }}>
        <table style={{
          width: "100%", borderCollapse: "collapse",
          font: `${t.font.size.sm} ${t.font.family}`,
        }}>
          <thead>
            <tr style={{ background: t.color.grey050 }}>
              <th scope="col" style={headCell("start")}>{tr("notif.prefs.event_col")}</th>
              {channels.map((c) => (
                <th key={c.channel} scope="col" style={headCell("center")}>
                  {tr(`notif.prefs.channel.${c.channel}`)}
                  {!c.available && (
                    <span style={{
                      display: "block", textTransform: "none", letterSpacing: 0,
                      font: `${t.font.size.xs} ${t.font.family}`, color: t.color.amber600,
                    }}>
                      {tr("notif.prefs.unavailable")}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.notification_events.map((ev) => {
              const row = rules[ev.event_type] ?? {};
              const allOff = channels.every((c) => !row[c.channel]);
              return (
                <tr key={ev.event_type} style={{ borderBottom: `1px solid ${t.color.grey100}` }}>
                  <th scope="row" style={{
                    textAlign: "start", padding: `${t.space(2.5)} ${t.space(3)}`,
                    font: `${t.font.weight.regular} ${t.font.size.sm} ${t.font.family}`,
                    color: t.color.grey900,
                  }}>
                    {tr(ev.label_token)}
                    {allOff && (
                      <span style={{
                        display: "block",
                        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.amber600,
                      }}>
                        {tr("notif.prefs.all_off_warning")}
                      </span>
                    )}
                  </th>
                  {channels.map((c) => (
                    <td key={c.channel} style={{ padding: t.space(2.5), textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!row[c.channel]}
                        onChange={() => toggle(ev.event_type, c.channel)}
                        aria-label={`${tr(ev.label_token)} — ${tr(`notif.prefs.channel.${c.channel}`)}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex", gap: t.space(2), alignItems: "center",
        marginTop: t.space(4), flexWrap: "wrap",
      }}>
        <Button onClick={save} disabled={saving || !draft}>
          {tr("notif.prefs.save")}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={saving}>
          {tr("notif.prefs.reset")}
        </Button>
        <Button variant="ghost" onClick={onClose}>{tr("common.close")}</Button>
        {saved && (
          <span style={{
            font: `${t.font.size.sm} ${t.font.family}`, color: t.color.green600,
          }}>
            {tr("notif.prefs.saved")}
          </span>
        )}
      </div>
    </Card>
  );
}

function headCell(align: "start" | "center"): React.CSSProperties {
  return {
    textAlign: align,
    padding: `${t.space(2.5)} ${t.space(3)}`,
    borderBottom: `1px solid ${t.color.grey200}`,
    font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
    color: t.color.grey500,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    whiteSpace: "nowrap",
  };
}
