import * as React from "react";
import type { DashboardPreferences, KpiKey } from "@poc/contracts";
import { tokens as t, Button, useI18n } from "@poc/uui-stub";

export interface KpiCustomiserProps {
  prefs: DashboardPreferences;
  /** Resolves a KPI key to its display label. */
  labelFor: (key: KpiKey) => string;
  onApply: (next: { kpi_order: KpiKey[]; kpi_hidden: KpiKey[] }) => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
}

/**
 * Dashboard personalisation editor — F9 / Epic 1.
 *
 * Reordering is done with explicit move buttons rather than drag-and-drop. Dragging
 * is a pointer-only gesture with no keyboard equivalent, and WCAG 2.2 adds 2.5.7
 * Dragging Movements specifically to require a single-pointer alternative, so the
 * buttons are the accessible primitive rather than a fallback bolted on afterwards.
 */
export function KpiCustomiser({
  prefs, labelFor, onApply, onReset, onClose,
}: KpiCustomiserProps) {
  const { t: tr } = useI18n();

  // Edited locally, then applied — so an accidental change is discardable.
  const [order, setOrder] = React.useState<KpiKey[]>(prefs.kpi_order);
  const [hidden, setHidden] = React.useState<Set<KpiKey>>(new Set(prefs.kpi_hidden));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const liveRef = React.useRef<HTMLDivElement>(null);

  const visibleCount = order.length - hidden.size;

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    // Announce the move: a visual reorder alone tells a screen-reader user nothing.
    if (liveRef.current) {
      liveRef.current.textContent = tr("prefs.moved", {
        name: labelFor(next[target]),
        position: target + 1,
        total: next.length,
      });
    }
  }

  function toggle(key: KpiKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      // Refuse the last tile here as well as on the API, so the user gets an
      // immediate explanation instead of a round-trip 422.
      else if (order.length - next.size > 1) next.add(key);
      return next;
    });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("api.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      borderTop: `1px solid ${t.color.grey200}`,
      background: t.color.grey050,
      padding: `${t.space(4)} ${t.space(5)}`,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: t.space(3), marginBottom: t.space(3), flexWrap: "wrap",
      }}>
        <div>
          <h3 style={{
            margin: 0,
            font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
            color: t.color.navy900,
          }}>
            {tr("prefs.title")}
          </h3>
          <p style={{
            margin: `${t.space(1)} 0 0`,
            font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
          }}>
            {tr("prefs.subtitle")}
          </p>
        </div>
        <span style={{
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
        }}>
          {tr("prefs.visible_count", { shown: visibleCount, total: order.length })}
        </span>
      </div>

      {/* Scrolls rather than pushing Apply off-screen once the tile list is long. */}
      <ul style={{
        listStyle: "none", margin: 0, padding: 0, display: "grid", gap: t.space(1.5),
        maxHeight: 340, overflowY: "auto",
      }}>
        {order.map((key, i) => {
          const isHidden = hidden.has(key);
          const lastVisible = !isHidden && visibleCount <= 1;
          return (
            <li key={key} style={{
              display: "flex", alignItems: "center", gap: t.space(3),
              background: t.color.white,
              border: `1px solid ${t.color.grey200}`,
              borderRadius: t.radius.sm,
              padding: `${t.space(2)} ${t.space(3)}`,
            }}>
              <input
                type="checkbox"
                id={`kpi-${key}`}
                checked={!isHidden}
                disabled={lastVisible}
                onChange={() => toggle(key)}
              />
              <label
                htmlFor={`kpi-${key}`}
                style={{
                  flex: 1, cursor: lastVisible ? "not-allowed" : "pointer",
                  font: `${t.font.size.sm} ${t.font.family}`,
                  color: isHidden ? t.color.grey500 : t.color.grey900,
                  textDecoration: isHidden ? "line-through" : "none",
                }}
                title={lastVisible ? tr("prefs.last_tile") : undefined}
              >
                {labelFor(key)}
              </label>

              <span style={{
                font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500,
                minWidth: 28, textAlign: "end",
              }} aria-hidden="true">
                {i + 1}
              </span>

              <span style={{ display: "flex", gap: 2 }}>
                <Button
                  size="sm" variant="secondary"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={tr("prefs.move_up", { name: labelFor(key) })}
                  style={{ padding: "3px 8px" }}
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  size="sm" variant="secondary"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={tr("prefs.move_down", { name: labelFor(key) })}
                  style={{ padding: "3px 8px" }}
                >
                  <span aria-hidden="true">↓</span>
                </Button>
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" style={{
          margin: `${t.space(3)} 0 0`,
          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500,
        }}>
          {error}
        </p>
      )}

      <div style={{
        display: "flex", gap: t.space(2), marginTop: t.space(4), flexWrap: "wrap",
      }}>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(async () => {
            await onApply({ kpi_order: order, kpi_hidden: [...hidden] });
            onClose();
          })}
        >
          {busy ? tr("prefs.saving") : tr("prefs.apply")}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>
          {tr("common.close")}
        </Button>
        <Button
          size="sm" variant="ghost" disabled={busy}
          onClick={() => run(async () => {
            await onReset();
            onClose();
          })}
        >
          {tr("prefs.reset")}
        </Button>
      </div>

      <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />
    </div>
  );
}
