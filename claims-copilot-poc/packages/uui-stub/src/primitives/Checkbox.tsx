import React from "react";
import { tokens as t } from "../tokens";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function Checkbox({ label, id, style, ...rest }: CheckboxProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <label
      htmlFor={fieldId}
      style={{
        display: "inline-flex", alignItems: "center", gap: t.space(2),
        font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey900,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
      }}
    >
      <input id={fieldId} type="checkbox" style={{ width: 15, height: 15, ...style }} {...rest} />
      {label}
    </label>
  );
}

export interface RadioProps extends Omit<CheckboxProps, "type"> {}

export function Radio({ label, id, style, ...rest }: RadioProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <label
      htmlFor={fieldId}
      style={{
        display: "inline-flex", alignItems: "center", gap: t.space(2),
        font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey900, cursor: "pointer",
      }}
    >
      <input id={fieldId} type="radio" style={{ width: 15, height: 15, ...style }} {...rest} />
      {label}
    </label>
  );
}
