import * as React from "react";
import { tokens as t, useI18n } from "@poc/uui-stub";
import { useApi } from "../api/ApiContext";

/**
 * Claim pinning — Epic 1 (p. 61).
 *
 * The pinned set is held once per screen and shared by every row, rather than each row
 * asking the API whether it is pinned. A page of ten claims would otherwise fire ten
 * requests to render ten stars.
 *
 * Toggling updates local state before the request resolves, because a star that lags
 * a click feels broken. The optimistic change is reverted if the request fails, so the
 * control never claims a pin the server refused - which it will if the caller has lost
 * access to the claim since the page loaded.
 */
export interface PinnedClaim {
  claim_id: string;
  note: string | null;
  pinned_at: string;
  aon_claim_id: string;
  status: string;
  sub_status: string | null;
  global_product: string;
  carrier: string;
  date_of_loss: string;
  loss_description: string;
  gross_incurred: number;
  currency_code: string;
}

interface PinsResponse {
  items: PinnedClaim[];
  unavailable_count: number;
  limit: number;
}

export interface PinsController {
  ids: Set<string>;
  items: PinnedClaim[];
  unavailableCount: number;
  limit: number;
  loading: boolean;
  isPinned: (claimId: string) => boolean;
  toggle: (claimId: string) => Promise<void>;
  reload: () => void;
}

export function usePins(): PinsController {
  const api = useApi();
  const [data, setData] = React.useState<PinsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);
  // Overlay of in-flight toggles, so the star responds on click.
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<PinsResponse>("/pins")
      .then((d) => { if (alive) { setData(d); setPending({}); } })
      .catch(() => { if (alive) setData({ items: [], unavailable_count: 0, limit: 0 }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, nonce]);

  const serverIds = React.useMemo(
    () => new Set((data?.items ?? []).map((p) => p.claim_id)),
    [data]
  );

  const isPinned = React.useCallback(
    (claimId: string) => pending[claimId] ?? serverIds.has(claimId),
    [pending, serverIds]
  );

  const toggle = React.useCallback(
    async (claimId: string) => {
      const next = !isPinned(claimId);
      setPending((p) => ({ ...p, [claimId]: next }));
      try {
        if (next) await api.put(`/claims/${claimId}/pin`, {});
        else await api.del(`/claims/${claimId}/pin`);
        setNonce((n) => n + 1);
      } catch {
        // Put the star back where the server says it should be.
        setPending((p) => {
          const { [claimId]: _dropped, ...rest } = p;
          return rest;
        });
      }
    },
    [api, isPinned]
  );

  const ids = React.useMemo(() => {
    const out = new Set(serverIds);
    for (const [id, on] of Object.entries(pending)) {
      if (on) out.add(id);
      else out.delete(id);
    }
    return out;
  }, [serverIds, pending]);

  return {
    ids,
    items: data?.items ?? [],
    unavailableCount: data?.unavailable_count ?? 0,
    limit: data?.limit ?? 0,
    loading,
    isPinned,
    toggle,
    reload: () => setNonce((n) => n + 1),
  };
}

/**
 * The star itself.
 *
 * Rendered as a real button with an accessible name that states the action rather than
 * the state, and `aria-pressed` carrying the state - so a screen reader announces
 * "Pin this claim, pressed" instead of leaving the toggle ambiguous.
 */
export function PinButton({
  claimId, pinned, onToggle, size = 16,
}: {
  claimId: string;
  pinned: boolean;
  onToggle: (claimId: string) => void;
  size?: number;
}) {
  const { t: tr } = useI18n();
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? tr("pins.unpin") : tr("pins.pin")}
      title={pinned ? tr("pins.unpin") : tr("pins.pin")}
      onClick={(e) => { e.stopPropagation(); onToggle(claimId); }}
      style={{
        background: "none", border: "none", padding: t.space(0.5),
        cursor: "pointer", lineHeight: 1, fontSize: size,
        // Amber reads as "flagged" without colliding with the teal used for links or
        // the red reserved for destructive actions.
        color: pinned ? t.color.amber600 : hovered ? t.color.grey700 : t.color.grey300,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span aria-hidden="true">{pinned ? "★" : "☆"}</span>
    </button>
  );
}
