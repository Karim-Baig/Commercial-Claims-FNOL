import * as React from "react";
import type { ClaimMessage, ClaimMessageThread } from "@poc/contracts";
import {
  tokens as t, Button, Spinner, Banner, ErrorState, useI18n,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { dateTime } from "../../format";

export interface MessageThreadProps {
  claimId: string;
  /** Falls back to a generic label when the claim carries no named lead. */
  claimLeadName?: string | null;
}

/**
 * In-context adjuster messaging — F9 / Epic 3.
 *
 * The thread is a client surface, so it shows only what the API returned. Aon-internal
 * notes are filtered server-side in message_routes.py; when any were withheld the
 * count is surfaced rather than hidden, on the same reasoning as the document panel:
 * a client should be able to tell that a record is partial.
 */
export function MessageThread({ claimId, claimLeadName }: MessageThreadProps) {
  const api = useApi();
  const { t: tr } = useI18n();
  const { locale } = api;

  const { data, loading, error, reload } = useResource<ClaimMessageThread>(
    (a) => a.get(`/claims/${claimId}/messages`),
    [claimId]
  );

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const liveRef = React.useRef<HTMLDivElement>(null);

  const messages = data?.items ?? [];

  // Keep the newest message in view as the thread grows.
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await api.post(`/claims/${claimId}/messages`, { body });
      setDraft("");
      // Announce success to assistive technology, which would otherwise get no
      // signal that the message left the composer.
      if (liveRef.current) liveRef.current.textContent = tr("msg.sent");
      reload();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : tr("api.generic"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      background: t.color.white,
      border: `1px solid ${t.color.grey200}`,
      borderRadius: t.radius.lg,
      overflow: "hidden",
      boxShadow: t.shadow.sm,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: t.space(3), padding: `${t.space(3)} ${t.space(5)}`,
        borderBottom: `1px solid ${t.color.grey200}`,
        font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
        color: t.color.navy900,
      }}>
        <span>{tr("msg.title")}</span>
        <span style={{
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
          fontWeight: t.font.weight.regular,
        }}>
          {claimLeadName
            ? tr("msg.with_lead", { name: claimLeadName })
            : tr("msg.with_aon")}
        </span>
      </div>

      {error ? (
        <div style={{ padding: t.space(5) }}>
          <ErrorState message={error.message} detail={error.detail} onRetry={reload} />
        </div>
      ) : (
        <>
          {typeof data?.withheld === "number" && data.withheld > 0 && (
            <div style={{ padding: `${t.space(3)} ${t.space(4)} 0` }}>
              <Banner tone="info" title={tr("msg.withheld_label")}>
                {tr("msg.withheld_body", { count: data.withheld })}
              </Banner>
            </div>
          )}

          <div
            ref={listRef}
            style={{
              maxHeight: 380, overflowY: "auto",
              padding: t.space(4),
              display: "flex", flexDirection: "column", gap: t.space(3),
            }}
          >
            {loading ? (
              <div style={{ display: "grid", placeItems: "center", padding: t.space(5) }}>
                <Spinner label={tr("common.loading")} />
              </div>
            ) : messages.length === 0 ? (
              <p style={{
                margin: 0, textAlign: "center", padding: t.space(4),
                font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
              }}>
                {tr("msg.empty")}
              </p>
            ) : (
              messages.map((m) => <Bubble key={m.message_id} message={m} locale={locale} tr={tr} />)
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={send}
            style={{ borderTop: `1px solid ${t.color.grey200}`, padding: t.space(4) }}
          >
            <label className="sr-only" htmlFor={`msg-${claimId}`}>
              {tr("msg.composer_label")}
            </label>
            <textarea
              id={`msg-${claimId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tr("msg.placeholder")}
              rows={3}
              maxLength={4000}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                padding: `${t.space(2)} ${t.space(3)}`,
                border: `1px solid ${t.color.grey300}`, borderRadius: t.radius.sm,
                font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey900,
              }}
            />

            {sendError && (
              <p role="alert" style={{
                margin: `${t.space(2)} 0 0`,
                font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500,
              }}>
                {sendError}
              </p>
            )}

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: t.space(2), gap: t.space(3),
            }}>
              <span style={{
                font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
              }}>
                {tr("msg.visible_to_aon")}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={!draft.trim() || sending}
                disabledReason={tr("msg.enter_message")}
              >
                {sending ? tr("msg.sending") : tr("msg.send")}
              </Button>
            </div>

            {/* Politeness region: announces the send without stealing focus. */}
            <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />
          </form>
        </>
      )}
    </div>
  );
}

function Bubble({
  message, locale, tr,
}: {
  message: ClaimMessage;
  locale: string;
  tr: (k: string, v?: Record<string, unknown>) => string;
}) {
  const own = message.is_own;
  const fromAon = message.author_role === "aon";

  return (
    <div style={{
      display: "flex",
      justifyContent: own ? "flex-end" : "flex-start",
    }}>
      <div style={{
        maxWidth: "78%",
        background: own ? t.color.teal050 : t.color.grey050,
        border: `1px solid ${own ? t.color.teal050 : t.color.grey200}`,
        borderRadius: t.radius.md,
        padding: `${t.space(2.5)} ${t.space(3)}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: t.space(2),
          marginBottom: t.space(1), flexWrap: "wrap",
        }}>
          <span style={{
            font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
            color: t.color.navy900,
          }}>
            {own ? tr("msg.you") : message.author_name}
          </span>
          {fromAon && (
            <span style={{
              background: t.color.navy700, color: t.color.white,
              borderRadius: t.radius.pill, padding: "1px 7px",
              font: `${t.font.weight.semibold} 10px ${t.font.family}`,
              textTransform: "uppercase", letterSpacing: ".4px",
            }}>
              {tr("msg.role_aon")}
            </span>
          )}
        </div>

        <p style={{
          margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          font: `${t.font.size.sm} ${t.font.family}`,
          color: t.color.grey900, lineHeight: 1.55,
        }}>
          {message.body}
        </p>

        <div style={{
          marginTop: t.space(1.5),
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>
          {dateTime(message.created_at, locale)}
        </div>
      </div>
    </div>
  );
}
