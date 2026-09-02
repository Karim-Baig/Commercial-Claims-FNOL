import * as React from "react";
import type { FnolDraftSummary } from "@poc/contracts";
import {
  tokens as t, Button, Spinner, ErrorState, useI18n,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { relativeTime } from "../../format";
import { currentDeviceLabel } from "../../device";
import { DelegateDraft } from "./DelegateDraft";

export interface DraftsPanelProps {
  /** Opens the wizard on a saved draft. */
  onResume: (draftId: string) => void;
}

/**
 * Cross-device draft continuity — F9 / Epic 5.
 *
 * Drafts are held server-side against the token subject, so this list is the same on
 * every device the user signs in from. The device label on each row is what makes
 * that legible: "last edited on Safari on iPhone" tells the user why a draft they
 * started elsewhere is waiting for them here.
 */
export function DraftsPanel({ onResume }: DraftsPanelProps) {
  const api = useApi();
  const { t: tr } = useI18n();
  const { locale } = api;

  const { data, loading, error, reload } = useResource<{ items: FnolDraftSummary[] }>(
    (a) => a.get("/fnol/drafts"),
    []
  );

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const thisDevice = React.useMemo(() => currentDeviceLabel(), []);

  async function discard(draftId: string) {
    setBusyId(draftId);
    try {
      await api.del(`/fnol/drafts/${draftId}`);
      reload();
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: t.space(8), display: "grid", placeItems: "center" }}>
        <Spinner label={tr("drafts.loading")} />
      </div>
    );
  }

  // A persona without claims_fnol has no drafts surface at all; the API answers 403.
  if (error?.status === 403) {
    return (
      <p style={{
        margin: 0, padding: t.space(6), textAlign: "center",
        font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
      }}>
        {tr("drafts.no_privilege")}
      </p>
    );
  }

  if (error) {
    return (
      <div style={{ padding: t.space(5) }}>
        <ErrorState message={error.message} detail={error.detail} onRetry={reload} />
      </div>
    );
  }

  const drafts = data?.items ?? [];

  if (drafts.length === 0) {
    return (
      <p style={{
        margin: 0, padding: t.space(8), textAlign: "center",
        font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
      }}>
        {tr("list.empty_drafts")}
      </p>
    );
  }

  return (
    <>
      <p style={{
        margin: 0, padding: `${t.space(3)} ${t.space(5)}`,
        borderBottom: `1px solid ${t.color.grey100}`,
        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
      }}>
        {tr("drafts.continuity_note")}
      </p>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {drafts.map((d) => {
          const elsewhere = Boolean(d.last_device && d.last_device !== thisDevice);
          const confirming = confirmId === d.draft_id;
          return (
            <li key={d.draft_id} style={{
              display: "flex", alignItems: "flex-start", gap: t.space(4),
              padding: `${t.space(4)} ${t.space(5)}`,
              borderBottom: `1px solid ${t.color.grey100}`,
              flexWrap: "wrap",
            }}>
              <span style={{ flex: "1 1 240px", minWidth: 0 }}>
                <span style={{
                  display: "block",
                  font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
                  color: t.color.navy900, overflowWrap: "anywhere",
                }}>
                  {d.label || tr("drafts.untitled")}
                </span>
                <span style={{
                  display: "block", marginTop: t.space(1),
                  font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                }}>
                  {tr("drafts.step_of", { step: d.current_step, total: 5 })}
                  {" · "}
                  {tr("drafts.edited", { when: relativeTime(d.updated_at, locale) })}
                  {d.last_device ? ` · ${d.last_device}` : ""}
                </span>
                {elsewhere && (
                  <span style={{
                    display: "inline-block", marginTop: t.space(1.5),
                    background: t.color.teal050, color: t.color.teal700,
                    borderRadius: t.radius.pill, padding: "1px 8px",
                    font: `${t.font.weight.semibold} 10px ${t.font.family}`,
                    textTransform: "uppercase", letterSpacing: ".4px",
                  }}>
                    {tr("drafts.other_device")}
                  </span>
                )}
              </span>

              <span style={{
                display: "flex", gap: t.space(2), flexShrink: 0,
                alignItems: "center", flexWrap: "wrap",
              }}>
                <Button size="sm" onClick={() => onResume(d.draft_id)}>
                  {tr("drafts.resume")}
                </Button>
                {/* Epic 2: sharing and discarding are the owner's calls. A delegate
                    sees neither control - only the badge saying who sent it. */}
                {d.owned_by_me === false ? (
                  <span style={{
                    background: t.color.blue050, color: t.color.blue600,
                    borderRadius: t.radius.pill, padding: "1px 8px",
                    font: `${t.font.weight.semibold} 10px ${t.font.family}`,
                    textTransform: "uppercase", letterSpacing: ".4px",
                  }}>
                    {tr("fnol.delegate.received_badge", {
                      name: d.delegated_by_name ?? tr("drafts.untitled"),
                    })}
                  </span>
                ) : (
                  <DelegateDraft
                    draftId={d.draft_id}
                    delegateName={d.delegate_name ?? null}
                    onChanged={reload}
                  />
                )}
                {d.owned_by_me === false ? null : confirming ? (
                  <>
                    <Button
                      size="sm" variant="danger"
                      disabled={busyId === d.draft_id}
                      onClick={() => discard(d.draft_id)}
                    >
                      {busyId === d.draft_id ? tr("drafts.discarding") : tr("drafts.confirm_discard")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      {tr("common.close")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm" variant="secondary"
                    onClick={() => setConfirmId(d.draft_id)}
                  >
                    {tr("drafts.discard")}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
