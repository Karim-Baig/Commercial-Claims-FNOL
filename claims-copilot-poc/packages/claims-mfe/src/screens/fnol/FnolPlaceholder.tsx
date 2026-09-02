import * as React from "react";
import {
  tokens as t, Button, Card, PageHeader, Stepper, Banner, FieldGroup,
  Select, DatePicker, useI18n, translateValue,
} from "@poc/uui-stub";
import type { ClaimsNav } from "../../ClaimsApp";

const STEP_KEYS = [
  "fnol.step_incident",
  "fnol.step_policy",
  "fnol.step_loss",
  "fnol.step_docs",
  "fnol.step_submit",
];

const STEP_DESC_KEYS = [
  null,
  "fnol.desc_policy",
  "fnol.desc_loss",
  "fnol.desc_docs",
  "fnol.desc_submit",
];

/**
 * FNOL wizard shell - Figure 5 / Epic 2 / Exhibit 4.
 *
 * Step 1 is wired so the five-step structure and the UUI form controls are visible.
 * The dynamic forms engine, the eleven product-conditional field groups and the
 * resilient outbox submission path are the next build increment.
 */
export function FnolPlaceholder({ nav }: { nav: ClaimsNav }) {
  const { t: tr } = useI18n();
  const [step, setStep] = React.useState(0);
  const [dateOfLoss, setDateOfLoss] = React.useState("");
  const [site, setSite] = React.useState("");
  const [claimType, setClaimType] = React.useState("Claim");

  const steps = STEP_KEYS.map((k) => ({ id: k, label: tr(k) }));

  return (
    <>
      <PageHeader
        title={tr("fnol.title")}
        subtitle={tr("fnol.subtitle")}
        breadcrumb={
          <Button variant="ghost" size="sm" onClick={nav.toLanding}>
            &larr; {tr("list.back_overview")}
          </Button>
        }
        actions={<Button variant="secondary">{tr("common.save_exit")}</Button>}
      />

      <Card style={{ marginBottom: t.space(4) }}>
        <Stepper steps={steps} current={step} onStepClick={setStep} />
      </Card>

      <div style={{ marginBottom: t.space(4) }}>
        <Banner tone="warning" title={tr("fnol.tier1_label")}>
          {tr("fnol.tier1_body")}
        </Banner>
      </div>

      <Card title={tr("fnol.step_of", {
        current: step + 1,
        total: steps.length,
        label: steps[step].label,
      })}>
        {step === 0 ? (
          <FieldGroup
            title={tr("fnol.group_incident")}
            hint={tr("fnol.group_incident_hint")}
          >
            <DatePicker
              label={tr("field.date_of_loss")}
              required
              value={dateOfLoss}
              onChange={(e) => setDateOfLoss(e.target.value)}
              hint={tr("fnol.date_hint")}
            />
            <Select
              label={tr("fnol.step_incident")}
              required
              placeholder={tr("fnol.site_placeholder")}
              value={site}
              onChange={(e) => setSite(e.target.value)}
              hint={tr("fnol.site_hint")}
              options={[
                { value: "SITE-JFK-T4-BISTRO", label: "JFK Terminal 4 — Bistro" },
                { value: "SITE-JFK-T4-CAFE", label: "JFK Terminal 4 — Café" },
                { value: "SITE-JFK-T7-GRILL", label: "JFK Terminal 7 — Grill" },
              ]}
            />
            <Select
              label={tr("detail.type")}
              required
              value={claimType}
              onChange={(e) => setClaimType(e.target.value)}
              hint={tr("fnol.type_hint")}
              options={[
                { value: "Claim", label: translateValue(tr, "claim_type", "Claim") },
                { value: "Incident", label: translateValue(tr, "claim_type", "Incident") },
              ]}
            />
          </FieldGroup>
        ) : (
          <div style={{
            padding: t.space(8), textAlign: "center",
            font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey500,
          }}>
            <strong style={{ color: t.color.navy700 }}>{steps[step].label}</strong>
            <p style={{ maxWidth: 520, margin: `${t.space(2)} auto 0` }}>
              {STEP_DESC_KEYS[step] ? tr(STEP_DESC_KEYS[step] as string) : null}
            </p>
          </div>
        )}

        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: t.space(5),
          paddingTop: t.space(4), borderTop: `1px solid ${t.color.grey200}`,
        }}>
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            &larr; {tr("common.back")}
          </Button>
          <Button
            disabled={step === 0 && (!dateOfLoss || !site)}
            disabledReason={tr("fnol.incomplete")}
            onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))}
          >
            {step === steps.length - 1
              ? tr("fnol.submit_claim")
              : `${tr("fnol.continue")} →`}
          </Button>
        </div>
      </Card>
    </>
  );
}
