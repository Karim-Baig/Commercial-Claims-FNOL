import * as React from "react";
import { tokens as t, Button, Spinner, useI18n } from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";

/**
 * FNOL delegation control — Epic 2 (p. 61).
 *
 * The candidate list comes from `/fnol/delegates`, which the API derives from the
 * caller's own scope and the FNOL privilege. The picker therefore cannot offer someone
 * the grant would have to elevate, and the server re-derives the same list on submit
 * rather than trusting the posted subject.
 *
 * Only the owner sees this control. A delegate can edit and submit the draft they were
 * given but cannot re-delegate or delete it, so there is nothing here for them to use.
 */
interface Delegate {
  sub: string;
  name: string;
  role: string;
  org_node: string;
}

export interface DelegateDraftProps {
  draftId: string;
  delegateName: string | null;
  onChanged: () => void;
}

export function DelegateDraft({ draftId, delegateName, onChanged }: DelegateDraftProps) {
  const api = useApi();
  const { t: tr } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Only fetched once the panel is opened - a claims list showing ten drafts should
  // not fire ten candidate lookups nobody asked for.
  const { data, loading } = useResource<{ items: Delegate[] }>(
    (a) => (open ? a.get("/fnol/delegates") : Promise.resolve({ items: [] })),
    [open]
  );

  async function assign() {
    if (!choice) return;
    setBusy(true);
    try {
      await api.post(`/fnol/drafts/${draftId}/delegate`, { delegate_sub: choice });
      setOpen(false);
      setChoice("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.del(`/fnol/drafts/${draftId}/delegate`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (delegateName) {
    return (
      <span style={{ display: "inline-flex", gap: t.space(2), alignItems: "center" }}>
        <span style={{
          background: t.color.blue050, color: t.color.blue600,
          borderRadius: t.radius.pill, padding: "1px 8px",
          font: `${t.font.weight.semibold} 10px ${t.font.family}`,
          textTransform: "uppercase", letterSpacing: ".4px",
        }}>
          {tr("fnol.delegate.shared_with", { name: delegateName })}
        </span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={revoke}>
          {tr("fnol.delegate.revoke")}
        </Button>
      </span>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {tr("fnol.delegate.open")}
      </Button>
    );
  }

  const candidates = data?.items ?? [];

  return (
    <span style={{
      display: "inline-flex", gap: t.space(2), alignItems: "center", flexWrap: "wrap",
    }}>
      {loading ? (
        <Spinner label={tr("common.loading")} />
      ) : candidates.length === 0 ? (
        <span style={{
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>
          {tr("fnol.delegate.none_available")}
        </span>
      ) : (
        <>
          <label style={{
            font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey700,
          }}>
            <span style={{ marginInlineEnd: t.space(1) }}>{tr("fnol.delegate.choose")}</span>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              style={{
                padding: `${t.space(1)} ${t.space(2)}`,
                border: `1px solid ${t.color.grey300}`,
                borderRadius: t.radius.sm,
                font: `${t.font.size.sm} ${t.font.family}`,
                background: t.color.white, color: t.color.grey900,
              }}
            >
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.sub} value={c.sub}>{c.name} · {c.role}</option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={!choice || busy} onClick={assign}>
            {tr("fnol.delegate.assign")}
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        {tr("common.close")}
      </Button>
    </span>
  );
}
