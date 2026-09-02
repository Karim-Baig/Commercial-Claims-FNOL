import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

export interface FileUploadProps {
  label?: string;
  /** NFR-29: the platform must support files up to at least 100 MB. */
  maxSizeMb?: number;
  accept?: string;
  multiple?: boolean;
  files?: UploadedFile[];
  onFiles?: (files: File[]) => void;
  onRemove?: (index: number) => void;
  /** Enables device camera capture on mobile (Epic 2). */
  allowCamera?: boolean;
}

export function FileUpload({
  label, maxSizeMb = 100, accept, multiple = true,
  files = [], onFiles, onRemove, allowCamera,
}: FileUploadProps) {
  const tr = useT();
  const heading = label ?? tr("uui.documents");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const camRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function accepted(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    const tooBig = arr.filter((f) => f.size > maxSizeMb * 1024 * 1024);
    if (tooBig.length) {
      setErr(tr("uui.file_too_large", { name: tooBig[0].name, max: maxSizeMb }));
      return;
    }
    setErr(null);
    onFiles?.(arr);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accepted(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${drag ? t.color.navy700 : t.color.grey300}`,
          background: drag ? t.color.grey100 : t.color.grey050,
          borderRadius: t.radius.md,
          padding: t.space(5),
          textAlign: "center",
          font: `${t.font.size.sm} ${t.font.family}`,
          color: t.color.grey700,
        }}
      >
        <div style={{ marginBottom: t.space(2), fontWeight: 600, color: t.color.navy700 }}>{heading}</div>
        <div style={{ display: "inline-flex", gap: t.space(2), flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" onClick={() => inputRef.current?.click()} style={btn}>{tr("uui.browse_files")}</button>
          {allowCamera && (
            <button type="button" onClick={() => camRef.current?.click()} style={btn}>{tr("uui.use_camera")}</button>
          )}
        </div>
        <div style={{ marginTop: t.space(2), font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
          {tr("uui.upload_hint", { max: maxSizeMb })}
        </div>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple}
               onChange={(e) => accepted(e.target.files)} style={{ display: "none" }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment"
               onChange={(e) => accepted(e.target.files)} style={{ display: "none" }} />
      </div>

      {err && (
        <div role="alert" style={{
          marginTop: t.space(2), font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500,
        }}>{err}</div>
      )}

      {files.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: `${t.space(3)} 0 0` }}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: t.space(3), padding: `${t.space(2)} ${t.space(2.5)}`,
              border: `1px solid ${t.color.grey200}`, borderRadius: t.radius.sm,
              marginBottom: t.space(1.5), font: `${t.font.size.sm} ${t.font.family}`,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: t.space(3), flex: "0 0 auto" }}>
                <span style={{ font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500 }}>
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {onRemove && (
                  <button type="button" aria-label={tr("uui.remove_file", { name: f.name })} onClick={() => onRemove(i)}
                          style={{ ...btn, color: t.color.red500, padding: "2px 7px" }}>&#10005;</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: t.color.white,
  border: `1px solid ${t.color.grey300}`,
  borderRadius: t.radius.md,
  padding: "6px 13px",
  cursor: "pointer",
  font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
  color: t.color.navy700,
};
