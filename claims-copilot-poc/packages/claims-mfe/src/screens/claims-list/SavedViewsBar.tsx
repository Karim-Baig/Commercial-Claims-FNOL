import * as React from "react";
import {
  tokens as t, Button, Modal, TextField, Checkbox, Banner, useI18n,
} from "@poc/uui-stub";
import { useApi } from "../../api/ApiContext";
import { fromSaved, toQuery } from "./useClaimFilters";
import type { ClaimFilterState, UseClaimFilters } from "./useClaimFilters";

/**
 * Saved and shareable views (Figure 3 p. 16; Epic 3 p. 62).
 *
 * A view stores filter criteria only - never claim data - so it carries no claim PII.
 * Sharing reuses the organisational scope model rather than introducing a second one:
 * a shared view is visible to anyone whose authorised scope contains the node it was
 * saved at, which is BR-001 downward inheritance applied unchanged.
 */
export interface SavedView {
  view_id: string;
  name: string;
  filters: Record<string, unknown>;
  is_shared: boolean;
  org_node: string;
  owner_name: string | null;
  owned_by_me: boolean;
}

export interface SavedViewsBarProps {
  ctrl: UseClaimFilters;
}

export function SavedViewsBar({ ctrl }: SavedViewsBarProps) {
  const api = useApi();
  const { t: tr } = useI18n();

  const [views, setViews] = React.useState<SavedView[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [share, setShare] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ items: SavedView[] }>("/views");
      setViews(r.items);
    } catch {
      // A failure here should not take the claims list down with it.
      setViews([]);
    }
  }, [api]);

  React.useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/views", {
        name: name.trim(),
        filters: toQuery(ctrl.filters),
        is_shared: share,
      });
      setDialogOpen(false);
      setName("");
      setShare(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: SavedView) {
    await api.del(`/views/${v.view_id}`);
    if (activeId === v.view_id) setActiveId(null);
    await load();
  }

  function apply(v: SavedView) {
    ctrl.replaceAll(fromSaved(v.filters) as ClaimFilterState);
    setActiveId(v.view_id);
  }

  const canSave = ctrl.activeCount > 0;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: t.space(2),
        padding: `${t.space(2)} ${t.space(5)}`, flexWrap: "wrap",
        borderBottom: `1px solid ${t.color.grey200}`,
      }}>
        <span style={{
          font: `${t.font.weight.medium} ${t.font.size.xs} ${t.font.family}`,
          color: t.color.grey500, textTransform: "uppercase", letterSpacing: "0.4px",
        }}>
          {tr("views.title")}
        </span>

        {views.length === 0 && (
          <span style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
            {tr("views.none")}
          </span>
        )}

        {views.map((v) => {
          const on = activeId === v.view_id;
          return (
            <span
              key={v.view_id}
              style={{
                display: "inline-flex", alignItems: "center", gap: t.space(1),
                background: on ? t.color.teal050 : t.color.grey100,
                border: `1px solid ${on ? t.color.teal600 : t.color.grey200}`,
                borderRadius: t.radius.pill, padding: "1px 3px 1px 10px",
              }}
            >
              <button
                onClick={() => apply(v)}
                title={
                  v.owned_by_me
                    ? undefined
                    : tr("views.shared_by", { name: v.owner_name ?? "", node: v.org_node })
                }
                style={{
                  background: "none", border: "none", padding: "3px 0", cursor: "pointer",
                  font: `${on ? t.font.weight.semibold : t.font.weight.regular} ${t.font.size.xs} ${t.font.family}`,
                  color: on ? t.color.teal700 : t.color.grey700,
                }}
              >
                {v.name}
                {v.is_shared && (
                  <span aria-label={tr("views.shared")} title={tr("views.shared")}
                        style={{ marginInlineStart: 5, opacity: 0.7 }}>
                    &#8226;{tr("views.shared_short")}
                  </span>
                )}
              </button>
              {/* Only the owner may remove a view; the API enforces this too. */}
              {v.owned_by_me && (
                <button
                  onClick={() => void remove(v)}
                  aria-label={tr("views.delete", { name: v.name })}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "0 5px", color: t.color.grey500, fontSize: 12,
                  }}
                >
                  &#10005;
                </button>
              )}
            </span>
          );
        })}

        <span style={{ marginInlineStart: "auto" }}>
          <Button
            size="sm"
            variant="secondary"
            unavailable={!canSave}
            title={canSave ? undefined : tr("views.nothing_to_save")}
            onClick={() => setDialogOpen(true)}
          >
            {tr("views.save")}
          </Button>
        </span>
      </div>

      <Modal
        open={dialogOpen}
        title={tr("views.save_title")}
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              {tr("common.cancel")}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={busy || name.trim().length === 0}
              disabledReason={tr("views.name_required")}
            >
              {tr("views.save")}
            </Button>
          </>
        }
      >
        {error && (
          <div style={{ marginBottom: t.space(3) }}>
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <TextField
          label={tr("views.name_label")}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          hint={tr("views.criteria_count", { count: ctrl.activeCount })}
        />

        <div style={{ marginTop: t.space(3) }}>
          <Checkbox
            label={tr("views.share_label")}
            checked={share}
            onChange={(e) => setShare(e.target.checked)}
          />
          <p style={{
            margin: `${t.space(1)} 0 0 ${t.space(6)}`,
            font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
          }}>
            {tr("views.share_hint")}
          </p>
        </div>
      </Modal>
    </>
  );
}
