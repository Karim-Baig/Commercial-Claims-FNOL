import * as React from "react";
import {
  tokens as t, Button, Card, PageHeader, Banner, Spinner, ErrorState, Tabs,
  Checkbox, Toast, useI18n,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { useEntitlements } from "../../entitlements/useEntitlements";
import type { ClaimsNav } from "../../ClaimsApp";

interface FieldDef {
  field_key: string;
  label_token: string;
  show_on_claim_list: boolean;
  show_on_claim_record: boolean;
  show_on_client_analytics: boolean;
  is_pii: boolean;
  c2s_order: number;
  default_visibility: string;
}

interface FieldRegistryResponse {
  fields: FieldDef[];
  generated_at: string;
}

/**
 * Admin Configuration Console — Screen 7 (NFR-45).
 *
 * THE DEMO MOMENT: toggle "show_on_claim_list" for any field, click Apply, then
 * switch to the Claims List and refresh. The column appears or disappears with
 * no code rebuild and no redeployment. This is the live proof of configurability.
 */
export function AdminConfigScreen({ nav }: { nav: ClaimsNav }) {
  const { t: tr } = useI18n();
  const api = useApi();
  const ent = useEntitlements();
  const [toast, setToast] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Record<string, Partial<FieldDef>>>({});

  const { data, loading, error, reload } = useResource<FieldRegistryResponse>(
    (a) => a.get("/config/field-registry"),
    []
  );

  if (!ent.isClientAdmin) {
    return (
      <Card>
        <Banner tone="error" title="Access denied">
          The Administration Console requires the Client Admin privilege (claims_client_admin).
          Sign in as Persona 2 (Risk Manager / Client Admin) to access this surface.
        </Banner>
      </Card>
    );
  }

  if (loading) return <div style={{ padding: t.space(10), display: "grid", placeItems: "center" }}><Spinner label="Loading configuration" /></div>;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const fields = data?.fields ?? [];

  function toggle(fieldKey: string, prop: keyof FieldDef, currentValue: boolean) {
    setPending((prev) => ({
      ...prev,
      [fieldKey]: { ...(prev[fieldKey] ?? {}), [prop]: !currentValue },
    }));
  }

  function currentVal(f: FieldDef, prop: keyof FieldDef): boolean {
    const p = pending[f.field_key];
    if (p && prop in p) return p[prop as string] as boolean;
    return f[prop] as boolean;
  }

  async function applyChanges() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    try {
      for (const [fieldKey, changes] of entries) {
        await api.post(`/config/field-registry/${fieldKey}`, changes);
      }
      setToast(`${entries.length} field(s) updated. Refresh the Claims List to see the effect — no rebuild required (NFR-45).`);
      setPending({});
      reload();
    } catch (e: any) {
      setToast(`Error applying changes: ${e?.message ?? "Unknown error"}`);
    }
  }

  const hasPending = Object.keys(pending).length > 0;

  return (
    <>
      <PageHeader
        title="Configuration Console"
        subtitle="Changes take effect immediately — no code modification or deployment (NFR-45)"
        breadcrumb={
          <Button variant="ghost" size="sm" onClick={nav.toLanding}>
            &larr; Overview
          </Button>
        }
        actions={
          <Button
            disabled={!hasPending}
            disabledReason="No changes pending."
            onClick={applyChanges}
          >
            Apply — no deployment required
          </Button>
        }
      />

      <Banner tone="warning" title="Demo moment">
        Toggle any field in the list below, then click Apply. Switch to the Claims List and
        refresh. The column appears or disappears instantly. That is NFR-45 live — configurable,
        not bespoke.
      </Banner>

      {hasPending && (
        <div style={{ margin: `${t.space(3)} 0` }}>
          <Banner tone="info" title={`${Object.keys(pending).length} unsaved change(s)`}>
            Click "Apply" above to persist. Changes are written to the database and served by the
            config API — the browser reads the updated field registry on next load.
          </Banner>
        </div>
      )}

      <Card title="Field Registry" padded={false} style={{ marginTop: t.space(4) }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            font: `${t.font.size.sm} ${t.font.family}`,
          }}>
            <thead>
              <tr style={{ background: t.color.navy700, color: t.color.white }}>
                {["Field", "Order", "Claims List", "Claim Record", "Analytics", "PII", "Changed"].map((h) => (
                  <th key={h} style={{
                    padding: `${t.space(2)} ${t.space(3)}`, textAlign: "left",
                    font: `${t.font.weight.semibold} ${t.font.size.xs} ${t.font.family}`,
                    letterSpacing: ".4px", textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => {
                const changed = !!pending[f.field_key];
                return (
                  <tr key={f.field_key} style={{
                    background: changed ? t.color.amber050 : i % 2 === 0 ? t.color.white : t.color.grey050 ?? "#fafafa",
                    borderBottom: `1px solid ${t.color.grey100}`,
                  }}>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}`, color: t.color.navy700, fontFamily: t.font.mono, fontSize: "12px" }}>
                      {f.field_key}
                      {f.is_pii && <span style={{ marginLeft: 6, background: t.color.red050, color: t.color.red500, borderRadius: t.radius.pill, padding: "1px 5px", fontSize: 10 }}>PII</span>}
                    </td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}`, color: t.color.grey500 }}>{f.c2s_order}</td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}` }}>
                      <Checkbox
                        label="" checked={currentVal(f, "show_on_claim_list")}
                        onChange={() => toggle(f.field_key, "show_on_claim_list", currentVal(f, "show_on_claim_list"))}
                      />
                    </td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}` }}>
                      <Checkbox
                        label="" checked={currentVal(f, "show_on_claim_record")}
                        onChange={() => toggle(f.field_key, "show_on_claim_record", currentVal(f, "show_on_claim_record"))}
                      />
                    </td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}` }}>
                      <Checkbox
                        label="" checked={currentVal(f, "show_on_client_analytics")}
                        onChange={() => toggle(f.field_key, "show_on_client_analytics", currentVal(f, "show_on_client_analytics"))}
                      />
                    </td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}`, color: f.is_pii ? t.color.red500 : t.color.grey300 }}>
                      {f.is_pii ? "Yes" : "—"}
                    </td>
                    <td style={{ padding: `${t.space(2)} ${t.space(3)}` }}>
                      {changed && (
                        <span style={{
                          background: t.color.amber600, color: t.color.white,
                          borderRadius: t.radius.pill, padding: "1px 7px", fontSize: 10,
                          fontWeight: 700,
                        }}>
                          pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: t.space(4) }}>
        <Banner tone="info" title="FNOL Forms — Tier 2">
          Product group enable/disable and per-field required toggles are configured via
          config/fnol-forms/*.json. A UI editor for this tab is scoped to Tier 2.
        </Banner>
      </div>

      {toast && (
        <Toast
          message={toast}
          tone="success"
          onDismiss={() => setToast(null)}
          duration={6000}
        />
      )}
    </>
  );
}
