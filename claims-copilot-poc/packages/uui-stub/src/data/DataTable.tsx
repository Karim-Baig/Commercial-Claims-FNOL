import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export interface DataTableColumn<Row> {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  hidden?: boolean;
  /** Override cell rendering. Used for PII masking and status pills. */
  render?: (row: Row) => React.ReactNode;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  /** Defaults to the localised "no records found" string. */
  emptyMessage?: string;
  caption?: string;
  loading?: boolean;
}

export function DataTable<Row extends Record<string, any>>({
  columns, rows, rowKey, onRowClick, sort, onSortChange,
  emptyMessage, caption, loading,
}: DataTableProps<Row>) {
  const tr = useT();
  const cols = columns.filter((c) => !c.hidden);
  const empty = emptyMessage ?? tr("uui.no_records");

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        font: `${t.font.size.sm} ${t.font.family}`,
      }}>
        {caption && (
          <caption style={{
            captionSide: "top", textAlign: "left", padding: `0 0 ${t.space(2)}`,
            font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
          }}>{caption}</caption>
        )}
        <thead>
          <tr>
            {cols.map((c) => {
              const isSorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  style={{
                    textAlign: c.align ?? "left",
                    width: c.width,
                    padding: `${t.space(2.5)} ${t.space(3)}`,
                    background: t.color.navy700,
                    color: t.color.white,
                    font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
                    textTransform: "uppercase",
                    letterSpacing: ".4px",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      onClick={() => onSortChange(c.key)}
                      style={{
                        all: "unset", cursor: "pointer", color: "inherit",
                        font: "inherit", display: "inline-flex", gap: 4,
                      }}
                    >
                      {c.label}
                      <span aria-hidden="true">{isSorted ? (sort!.dir === "asc" ? "\u25B2" : "\u25BC") : ""}</span>
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={cols.length} style={{ padding: t.space(6), textAlign: "center", color: t.color.grey500 }}>
              {tr("common.loading")}&hellip;
            </td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: t.space(6), textAlign: "center", color: t.color.grey500 }}>
              {empty}
            </td></tr>
          )}
          {!loading && rows.map((r, i) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              style={{
                background: i % 2 ? t.color.grey050 : t.color.white,
                cursor: onRowClick ? "pointer" : undefined,
                borderBottom: `1px solid ${t.color.grey200}`,
              }}
            >
              {cols.map((c) => (
                <td key={c.key} style={{
                  padding: `${t.space(2.5)} ${t.space(3)}`,
                  textAlign: c.align ?? "left",
                  color: t.color.grey900,
                  whiteSpace: "nowrap",
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {c.render ? c.render(r) : String(r[c.key] ?? "\u2014")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
