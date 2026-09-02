import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
}

export function TextField({
  label, hint, error, required, multiline, rows = 4,
  maxLength, showCount, id, value, style, ...rest
}: TextFieldProps) {
  const tr = useT();
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errId = error ? `${fieldId}-err` : undefined;

  const shared: React.CSSProperties = {
    width: "100%",
    font: `${t.font.weight.regular} ${t.font.size.md} ${t.font.family}`,
    padding: "7px 10px",
    borderRadius: t.radius.md,
    border: `1px solid ${error ? t.color.red500 : t.color.grey300}`,
    background: rest.readOnly ? t.color.grey050 : t.color.white,
    color: t.color.grey900,
    boxSizing: "border-box",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space(1) }}>
      {label && (
        <label htmlFor={fieldId} style={{
          font: `${t.font.weight.medium} ${t.font.size.sm} ${t.font.family}`,
          color: t.color.grey700,
        }}>
          {label}
          {required && <span aria-hidden="true" style={{ color: t.color.red500 }}> *</span>}
          {required && <span className="sr-only"> {tr("common.required")}</span>}
        </label>
      )}

      {multiline ? (
        <textarea
          id={fieldId} rows={rows} maxLength={maxLength} value={value as string}
          required={required} aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          style={shared}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={fieldId} maxLength={maxLength} value={value}
          required={required} aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          style={shared}
          {...rest}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: t.space(2) }}>
        <span>
          {error ? (
            <span id={errId} role="alert" style={{
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500,
            }}>{error}</span>
          ) : hint ? (
            <span id={hintId} style={{
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
            }}>{hint}</span>
          ) : null}
        </span>
        {showCount && maxLength ? (
          <span style={{ font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500 }}>
            {String(value ?? "").length}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const Textarea = (p: Omit<TextFieldProps, "multiline">) => (
  <TextField {...p} multiline />
);
