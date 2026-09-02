import * as React from "react";
import { tokens as t, Select, TextField, DatePicker, Checkbox, FieldGroup, ReadOnlyField } from "@poc/uui-stub";
import { useI18n } from "@poc/uui-stub";

// Matches the shape of config/fnol-forms/*.json
export interface FnolFieldSpec {
  key: string;
  type: "text" | "textarea" | "select" | "date" | "number" | "checkbox";
  required?: boolean;
  pii?: boolean;
  max_length?: number;
  options?: string[];
  hint?: string;
  label_override?: string;
  enabled?: boolean;
}

export interface FnolGroupSpec {
  dynamic_category: string;
  applies_when: {
    product_line?: string[];
    always?: boolean;
  };
  label_token: string;
  fields: FnolFieldSpec[];
}

interface DynamicFormEngineProps {
  groups: FnolGroupSpec[];
  productLine: string;
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string | boolean) => void;
}

function matches(spec: FnolGroupSpec["applies_when"], productLine: string): boolean {
  if (spec.always) return true;
  if (spec.product_line) {
    return spec.product_line.some(
      (p) => productLine.toLowerCase().includes(p.toLowerCase()) ||
             p.toLowerCase().includes(productLine.toLowerCase())
    );
  }
  return false;
}

function DynamicField({
  spec, value, onChange,
}: {
  spec: FnolFieldSpec;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const { t: tr } = useI18n();
  const label = spec.label_override || tr(`fnol.field.${spec.key}`, { fallback: spec.key.replace(/_/g, " ") });
  const strVal = (value as string) ?? "";

  if (spec.type === "select" && spec.options) {
    return (
      <Select
        label={label}
        required={spec.required}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        hint={spec.hint}
        options={spec.options.map((o) => ({ value: o, label: o }))}
        placeholder="Select…"
      />
    );
  }
  if (spec.type === "date") {
    return (
      <DatePicker
        label={label}
        required={spec.required}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        hint={spec.hint}
      />
    );
  }
  if (spec.type === "checkbox") {
    return (
      <Checkbox
        label={label}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        hint={spec.hint}
      />
    );
  }
  if (spec.type === "textarea") {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{
          display: "block",
          font: `${t.font.weight.medium} ${t.font.size.sm} ${t.font.family}`,
          color: t.color.grey700, marginBottom: t.space(1.5),
        }}>
          {label}{spec.required && <span style={{ color: t.color.red500, marginLeft: 3 }}>*</span>}
        </label>
        <textarea
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          maxLength={spec.max_length}
          rows={3}
          style={{
            width: "100%", padding: `${t.space(2)} ${t.space(2.5)}`,
            border: `1px solid ${t.color.grey300}`, borderRadius: t.radius.sm,
            font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey900,
            resize: "vertical", boxSizing: "border-box",
          }}
        />
        {spec.max_length && (
          <div style={{ textAlign: "right", font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey400 }}>
            {strVal.length}/{spec.max_length}
          </div>
        )}
      </div>
    );
  }
  // text / number
  return (
    <TextField
      label={label}
      required={spec.required}
      value={strVal}
      type={spec.type === "number" ? "number" : "text"}
      onChange={(e) => onChange(e.target.value)}
      hint={spec.hint}
    />
  );
}

/**
 * Renders product-conditional field groups from JSON configuration.
 * The engine itself contains zero product-specific logic — all rules live in
 * config/fnol-forms/*.json. Adding a new product line = adding a JSON file.
 */
export function DynamicFormEngine({ groups, productLine, values, onChange }: DynamicFormEngineProps) {
  const active = groups.filter((g) => matches(g.applies_when, productLine));

  if (active.length === 0) return null;

  return (
    <>
      {active.map((group) => {
        const visibleFields = group.fields.filter((f) => f.enabled !== false);
        if (visibleFields.length === 0) return null;

        return (
          <FieldGroup
            key={group.dynamic_category}
            title={group.dynamic_category}
            configDriven
          >
            {visibleFields.map((field) => (
              <DynamicField
                key={field.key}
                spec={field}
                value={values[field.key]}
                onChange={(v) => onChange(field.key, v)}
              />
            ))}
          </FieldGroup>
        );
      })}
    </>
  );
}
