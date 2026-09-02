import React from "react";
import { tokens as t } from "../tokens";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label, hint, error, options, placeholder, id, required, style, ...rest
}: SelectProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space(1) }}>
      {label && (
        <label htmlFor={fieldId} style={{
          font: `${t.font.weight.medium} ${t.font.size.sm} ${t.font.family}`,
          color: t.color.grey700,
        }}>
          {label}
          {required && <span aria-hidden="true" style={{ color: t.color.red500 }}> *</span>}
        </label>
      )}
      <select
        id={fieldId} required={required} aria-required={required || undefined}
        aria-invalid={error ? true : undefined} aria-describedby={hintId}
        style={{
          width: "100%",
          font: `${t.font.size.md} ${t.font.family}`,
          padding: "7px 9px",
          borderRadius: t.radius.md,
          border: `1px solid ${error ? t.color.red500 : t.color.grey300}`,
          background: t.color.white,
          color: t.color.grey900,
          boxSizing: "border-box",
          ...style,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      {hint && !error && (
        <span id={hintId} style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
          {hint}
        </span>
      )}
      {error && (
        <span role="alert" style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.red500 }}>
          {error}
        </span>
      )}
    </div>
  );
}
