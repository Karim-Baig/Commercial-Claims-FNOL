import * as React from "react";
import { tokens as t, GatedAction, Button, Spinner, useI18n } from "@poc/uui-stub";
import { useApi } from "../../api/ApiContext";
import { toQuery } from "./useClaimFilters";
import type { ClaimFilterState } from "./useClaimFilters";

/**
 * Bulk export to Excel or PDF (Core Claims Experience p. 12; WS1 p. 18; Epic 3 p. 62).
 *
 * The file is generated server-side and downloaded as a blob. Two reasons:
 *
 *   - PII masking has to be enforced before the data leaves the service. If the
 *     browser received unmasked rows and redacted them for display, the redaction
 *     would be cosmetic and a network trace would defeat it (WS1, p. 18).
 *   - The export endpoints require a Bearer token, so an anchor href or window.open
 *     would not authenticate.
 *
 * The current filter state is passed through, so the file matches what is on screen
 * rather than exporting everything in scope.
 */
export interface ExportMenuProps {
  filters: ClaimFilterState;
  tab: "submitted" | "drafts";
  sort: { key: string; dir: "asc" | "desc" };
  allowed: boolean;
  totalRows: number;
}

export function ExportMenu({ filters, tab, sort, allowed, totalRows }: ExportMenuProps) {
  const api = useApi();
  const { t: tr } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(format: "xlsx" | "pdf") {
    setBusy(format);
    setError(null);
    try {
      await api.download(`/export/claims.${format}`, {
        ...toQuery(filters),
        tab,
        sort: sort.key,
        dir: sort.dir,
      });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!allowed) {
    // Entitlement withheld: GatedAction renders the reason on screen rather than
    // hiding it in a tooltip (NFR-41).
    return (
      <GatedAction variant="secondary" allowed={false} reason={tr("list.export_denied")}>
        {tr("list.export")}
      </GatedAction>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <Button
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        unavailable={totalRows === 0}
        title={totalRows === 0 ? tr("list.export_nothing") : undefined}
      >
        {tr("list.export")}
        <span aria-hidden="true" style={{ fontSize: 9, marginInlineStart: 2 }}>&#9660;</span>
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={tr("list.export")}
          style={{
            position: "absolute", top: "calc(100% + 4px)", insetInlineEnd: 0,
            background: t.color.white, border: `1px solid ${t.color.grey200}`,
            borderRadius: t.radius.md, boxShadow: t.shadow.lg,
            padding: t.space(2), minWidth: 240, zIndex: 60,
          }}
        >
          <p style={{
            margin: `0 0 ${t.space(2)}`, padding: `0 ${t.space(2)}`,
            font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
          }}>
            {tr("list.export_scope_note", { count: totalRows })}
          </p>

          <MenuItem
            onClick={() => void run("xlsx")}
            busy={busy === "xlsx"}
            title={tr("list.export_xlsx")}
            hint={tr("list.export_xlsx_hint")}
          />
          <MenuItem
            onClick={() => void run("pdf")}
            busy={busy === "pdf"}
            title={tr("list.export_pdf")}
            hint={tr("list.export_pdf_hint")}
          />

          {error && (
            <p role="alert" style={{
              margin: `${t.space(2)} 0 0`, padding: `0 ${t.space(2)}`,
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500,
            }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick, busy, title, hint,
}: {
  onClick: () => void;
  busy: boolean;
  title: string;
  hint: string;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block", width: "100%", textAlign: "start",
        background: hover ? t.color.grey050 : "none",
        border: "none", borderRadius: t.radius.sm, cursor: busy ? "wait" : "pointer",
        padding: `${t.space(2)} ${t.space(2)}`,
      }}
    >
      <span style={{
        display: "flex", alignItems: "center", gap: t.space(2),
        font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
        color: t.color.navy900,
      }}>
        {title}
        {busy && <Spinner size={13} label="" />}
      </span>
      <span style={{
        display: "block",
        font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
      }}>{hint}</span>
    </button>
  );
}
