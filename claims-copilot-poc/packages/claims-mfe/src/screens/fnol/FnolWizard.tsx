import * as React from "react";
import {
  tokens as t, Button, Card, PageHeader, Stepper, Banner, FieldGroup,
  Select, DatePicker, TextField, Checkbox, FileUpload, ReadOnlyField,
  Spinner, Toast, useI18n, translateValue,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { useEntitlements } from "../../entitlements/useEntitlements";
import { currentDeviceLabel } from "../../device";
import { dateTime } from "../../format";
import type { ClaimsNav } from "../../ClaimsApp";
import { DynamicFormEngine } from "./DynamicFormEngine";
import type { FnolGroupSpec } from "./DynamicFormEngine";

const STEP_KEYS = [
  "fnol.step_incident",
  "fnol.step_policy",
  "fnol.step_loss",
  "fnol.step_docs",
  "fnol.step_submit",
];

interface HierarchyNode { org_node: string; display_name: string; level: string; }
interface Policy {
  policy_id: string; product_line: string; carrier_name: string;
  carrier_policy_number: string; cover_number: string; agreement_version: string;
  effective_date: string; expiration_date: string;
  aon_contact_name: string; aon_contact_email: string;
}

// ── Step 1 ────────────────────────────────────────────────────────────────────
function Step1({
  dateOfLoss, setDateOfLoss, site, setSite, claimType, setClaimType,
  sites,
}: {
  dateOfLoss: string; setDateOfLoss: (v: string) => void;
  site: string; setSite: (v: string) => void;
  claimType: string; setClaimType: (v: string) => void;
  sites: HierarchyNode[];
}) {
  const { t: tr } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  return (
    <FieldGroup title={tr("fnol.group_incident")} hint={tr("fnol.group_incident_hint")}>
      <DatePicker
        label={tr("field.date_of_loss")}
        required
        value={dateOfLoss}
        max={today}
        onChange={(e) => setDateOfLoss(e.target.value)}
        hint={tr("fnol.date_hint")}
      />
      <Select
        label={tr("fnol.site_label")}
        required
        placeholder={tr("fnol.site_placeholder")}
        value={site}
        onChange={(e) => setSite(e.target.value)}
        hint={tr("fnol.site_hint")}
        options={sites.filter((s) => s.level === "site").map((s) => ({
          value: s.org_node,
          label: s.display_name,
        }))}
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
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
function Step2({
  policies, loading, selectedPolicy, setSelectedPolicy,
}: {
  policies: Policy[]; loading: boolean;
  selectedPolicy: string; setSelectedPolicy: (v: string) => void;
}) {
  const { t: tr } = useI18n();
  if (loading) return <Spinner label={tr("fnol.loading_policies")} />;
  if (policies.length === 0) {
    return (
      <Banner tone="warning" title={tr("fnol.no_policies_title")}>
        {tr("fnol.no_policies_body")}
      </Banner>
    );
  }
  const selected = policies.find((p) => p.policy_id === selectedPolicy);
  return (
    <>
      <p style={{ font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey600, marginBottom: t.space(3) }}>
        {tr("fnol.policy_intro")}
      </p>
      {policies.map((p) => (
        <div
          key={p.policy_id}
          onClick={() => setSelectedPolicy(p.policy_id)}
          role="radio"
          aria-checked={selectedPolicy === p.policy_id}
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setSelectedPolicy(p.policy_id)}
          style={{
            border: `2px solid ${selectedPolicy === p.policy_id ? t.color.navy700 : t.color.grey200}`,
            borderRadius: t.radius.md, padding: t.space(3), marginBottom: t.space(2),
            cursor: "pointer", background: selectedPolicy === p.policy_id ? t.color.blue050 : t.color.white,
            display: "flex", gap: t.space(3), alignItems: "flex-start",
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: `2px solid ${selectedPolicy === p.policy_id ? t.color.navy700 : t.color.grey300}`,
            background: selectedPolicy === p.policy_id ? t.color.navy700 : t.color.white,
            flexShrink: 0, marginTop: 3,
          }} />
          <div>
            <div style={{ font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`, color: t.color.navy700 }}>
              {p.policy_id} — {p.product_line}
            </div>
            <div style={{ font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey600, marginTop: 2 }}>
              {p.carrier_name} · Cover {p.cover_number} · v{p.agreement_version} ·{" "}
              {p.effective_date} to {p.expiration_date}
            </div>
            {p.aon_contact_name && (
              <div style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500, marginTop: 2 }}>
                Aon contact: {p.aon_contact_name} — {p.aon_contact_email}
              </div>
            )}
          </div>
        </div>
      ))}
      {selected && (
        <div style={{ marginTop: t.space(3) }}>
          <FieldGroup title="Selected policy details">
            <ReadOnlyField label="Policy ID" value={selected.policy_id} />
            <ReadOnlyField label="Product Line" value={selected.product_line} />
            <ReadOnlyField label="Carrier" value={selected.carrier_name} />
            <ReadOnlyField label="Policy Number" value={selected.carrier_policy_number} />
            <ReadOnlyField label="Cover Number" value={selected.cover_number} />
            <ReadOnlyField label="Agreement Version" value={`v${selected.agreement_version}`} />
            <ReadOnlyField label="Period" value={`${selected.effective_date} – ${selected.expiration_date}`} />
            <ReadOnlyField label="Aon Contact" value={selected.aon_contact_name} />
            <ReadOnlyField label="Aon Contact Email" value={selected.aon_contact_email} />
          </FieldGroup>
        </div>
      )}
    </>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────────
// `cause_of_loss` is declared `dynamic_by_product` in config/fnol-forms/_core.json:
// offering "Cargo Damage in Transit" on a motor claim is the same category of nonsense
// the seeded claim data used to show.
const CAUSE_OPTIONS_BY_PRODUCT: Record<string, string[]> = {
  "Property & Equipment": [
    "Escape of Water", "Fire", "Storm Damage", "Impact Damage", "Equipment Breakdown", "Theft",
  ],
  "Motor Fleet": ["Motor Collision", "Impact Damage", "Theft"],
  "General Liability": [
    "Slip and Fall", "Food-borne Illness", "Scald Injury",
    "Third Party Property Damage", "Escape of Water",
  ],
  "Cyber": ["Ransomware", "Data Breach", "Funds Transfer Fraud", "System Outage"],
  "Marine Cargo": ["Cargo Damage in Transit", "Cargo Theft"],
  "Employers Liability": [
    "Slip and Fall", "Burn Injury", "Manual Handling Injury", "Laceration",
  ],
};

const ALL_CAUSES = [...new Set(Object.values(CAUSE_OPTIONS_BY_PRODUCT).flat())].sort();

function Step3({
  values, onChange, fnolGroups, productLine,
}: {
  values: Record<string, string>; onChange: (k: string, v: string) => void;
  fnolGroups: FnolGroupSpec[]; productLine: string;
}) {
  const { t: tr } = useI18n();
  return (
    <>
      <FieldGroup title={tr("fnol.group_core_loss")}>
        <TextField label={tr("field.named_insured")} value={values.named_insured ?? ""} onChange={(e) => onChange("named_insured", e.target.value)} />
        <Select label={tr("field.loss_country")} required value={values.loss_country ?? ""}
          onChange={(e) => onChange("loss_country", e.target.value)}
          options={[
            { value: "US", label: "United States" }, { value: "GB", label: "United Kingdom" },
            { value: "SG", label: "Singapore" }, { value: "AE", label: "UAE" },
            { value: "AU", label: "Australia" }, { value: "DE", label: "Germany" },
          ]}
          placeholder="Select country…"
        />
        <TextField label={tr("field.loss_address")} value={values.loss_address ?? ""} onChange={(e) => onChange("loss_address", e.target.value)} />
        <Select label={tr("fnol.who_experienced")} required value={values.party ?? ""}
          onChange={(e) => onChange("party", e.target.value)}
          options={[
            { value: "first", label: "1st party" },
            { value: "third", label: "3rd party" },
            { value: "both", label: "Both" },
          ]}
          placeholder="Select…"
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", font: `${t.font.weight.medium} ${t.font.size.sm} ${t.font.family}`, color: t.color.grey700, marginBottom: t.space(1.5) }}>
            {tr("field.loss_description")} <span style={{ color: t.color.red500 }}>*</span>
          </label>
          <textarea
            required value={values.loss_description ?? ""} maxLength={2000} rows={4}
            onChange={(e) => onChange("loss_description", e.target.value)}
            style={{
              width: "100%", padding: `${t.space(2)} ${t.space(2.5)}`,
              border: `1px solid ${t.color.grey300}`, borderRadius: t.radius.sm,
              font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey900,
              resize: "vertical", boxSizing: "border-box",
            }}
          />
          <div style={{ textAlign: "right", font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey400 }}>
            {(values.loss_description ?? "").length}/2000
          </div>
        </div>
        <Select label={tr("field.cause_of_loss")} required value={values.cause_of_loss ?? ""}
          onChange={(e) => onChange("cause_of_loss", e.target.value)}
          options={(CAUSE_OPTIONS_BY_PRODUCT[productLine] ?? ALL_CAUSES).map((o) => ({ value: o, label: o }))}
          placeholder="Select cause…"
        />
        <Select label={tr("fnol.currency")} required value={values.currency ?? "USD"}
          onChange={(e) => onChange("currency", e.target.value)}
          options={[
            { value: "USD", label: "USD" }, { value: "GBP", label: "GBP" },
            { value: "SGD", label: "SGD" }, { value: "EUR", label: "EUR" }, { value: "AED", label: "AED" },
          ]}
        />
        <TextField label={tr("fnol.initial_reserve")} value={values.initial_reserve ?? ""} type="number" onChange={(e) => onChange("initial_reserve", e.target.value)} />
        <TextField label={tr("field.client_claim_ref")} value={values.client_claim_ref ?? ""} onChange={(e) => onChange("client_claim_ref", e.target.value)} />
      </FieldGroup>

      <DynamicFormEngine
        groups={fnolGroups}
        productLine={productLine}
        values={values}
        onChange={onChange}
      />
    </>
  );
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
interface Contact { name: string; email: string; phone: string; can_view: boolean; can_modify: boolean; include_on_emails: boolean; }

function Step4({
  files, setFiles, contacts, setContacts,
}: {
  files: File[]; setFiles: (f: File[]) => void;
  contacts: Contact[]; setContacts: (c: Contact[]) => void;
}) {
  const { t: tr } = useI18n();
  const [newContact, setNewContact] = React.useState<Contact>({
    name: "", email: "", phone: "", can_view: true, can_modify: false, include_on_emails: true,
  });
  const [showAdd, setShowAdd] = React.useState(false);

  function addContact() {
    if (!newContact.name) return;
    setContacts([...contacts, newContact]);
    setNewContact({ name: "", email: "", phone: "", can_view: true, can_modify: false, include_on_emails: true });
    setShowAdd(false);
  }

  return (
    <>
      <FieldGroup title={tr("fnol.group_docs")}>
        <div style={{ gridColumn: "1 / -1" }}>
          <FileUpload
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            maxSizeMb={100}
            files={files}
            onFilesChange={setFiles}
          />
        </div>
      </FieldGroup>

      <FieldGroup title={tr("fnol.group_contacts")}>
        <div style={{ gridColumn: "1 / -1" }}>
          {contacts.map((c, i) => (
            <div key={i} style={{
              border: `1px solid ${t.color.grey200}`, borderRadius: t.radius.sm,
              padding: t.space(3), marginBottom: t.space(2), background: t.color.grey050 ?? "#f9f9f9",
            }}>
              <div style={{ font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`, color: t.color.navy700 }}>
                {c.name}
              </div>
              <div style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500 }}>
                {c.email} {c.phone && `· ${c.phone}`}
              </div>
              <div style={{ display: "flex", gap: t.space(3), marginTop: t.space(1.5), font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey600 }}>
                <span>{c.can_view ? "✓" : "✗"} Can view</span>
                <span>{c.can_modify ? "✓" : "✗"} Can modify</span>
                <span>{c.include_on_emails ? "✓" : "✗"} On emails</span>
              </div>
            </div>
          ))}

          {showAdd ? (
            <div style={{ border: `1px solid ${t.color.navy700}`, borderRadius: t.radius.sm, padding: t.space(3) }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: t.space(3), marginBottom: t.space(3) }}>
                <TextField label="Name" required value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <TextField label="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                <TextField label="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: t.space(4), marginBottom: t.space(3) }}>
                <Checkbox label="Can view claims" checked={newContact.can_view} onChange={(e) => setNewContact({ ...newContact, can_view: e.target.checked })} />
                <Checkbox label="Can modify claims" checked={newContact.can_modify} onChange={(e) => setNewContact({ ...newContact, can_modify: e.target.checked })} />
                <Checkbox label="Include on emails" checked={newContact.include_on_emails} onChange={(e) => setNewContact({ ...newContact, include_on_emails: e.target.checked })} />
              </div>
              <div style={{ display: "flex", gap: t.space(2) }}>
                <Button onClick={addContact} disabled={!newContact.name}>Add contact</Button>
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowAdd(true)}>+ Add Contact</Button>
          )}
        </div>
      </FieldGroup>
    </>
  );
}

// ── Step 5 ────────────────────────────────────────────────────────────────────
function Step5({
  step1, selectedPolicy, policies, step3Values, contacts, files, onSubmit, submitting,
}: {
  step1: { dateOfLoss: string; site: string; claimType: string };
  selectedPolicy: string; policies: Policy[];
  step3Values: Record<string, string>;
  contacts: Contact[]; files: File[];
  onSubmit: () => void; submitting: boolean;
}) {
  const { t: tr } = useI18n();
  const [attested, setAttested] = React.useState(false);
  const policy = policies.find((p) => p.policy_id === selectedPolicy);

  return (
    <>
      <FieldGroup title="Step 1 — Incident Details">
        <ReadOnlyField label={tr("field.date_of_loss")} value={step1.dateOfLoss} />
        <ReadOnlyField label="Site" value={step1.site} />
        <ReadOnlyField label={tr("detail.type")} value={step1.claimType} />
      </FieldGroup>

      <FieldGroup title="Step 2 — Policy">
        <ReadOnlyField label="Policy" value={policy ? `${policy.policy_id} — ${policy.product_line}` : "None selected"} />
        <ReadOnlyField label="Carrier" value={policy?.carrier_name ?? "—"} />
      </FieldGroup>

      <FieldGroup title="Step 3 — Loss Details">
        <ReadOnlyField label={tr("field.named_insured")} value={step3Values.named_insured} />
        <ReadOnlyField label={tr("field.loss_country")} value={step3Values.loss_country} />
        <ReadOnlyField label={tr("field.cause_of_loss")} value={step3Values.cause_of_loss} />
        <ReadOnlyField label={tr("field.loss_description")} value={step3Values.loss_description} />
      </FieldGroup>

      <FieldGroup title="Step 4 — Documents & Contacts">
        <ReadOnlyField label="Documents" value={files.length > 0 ? `${files.length} file(s) attached` : "None"} />
        <ReadOnlyField label="Contacts" value={contacts.length > 0 ? `${contacts.length} contact(s)` : "None"} />
      </FieldGroup>

      <div style={{ margin: `${t.space(4)} 0`, padding: t.space(4), background: t.color.blue050, borderRadius: t.radius.md }}>
        <Checkbox
          label="I confirm that the information provided is accurate to the best of my knowledge, and I am authorised to submit this claim on behalf of the named insured."
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
      </div>

      <Button
        disabled={!attested || submitting}
        disabledReason={!attested ? "Please confirm the attestation above before submitting." : undefined}
        onClick={onSubmit}
      >
        {submitting ? "Submitting…" : tr("fnol.submit_claim")}
      </Button>
    </>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export function FnolWizard({ nav, draftId }: { nav: ClaimsNav; draftId?: string }) {
  const { t: tr } = useI18n();
  const api = useApi();
  const [step, setStep] = React.useState(0);

  // ── Cross-device draft continuity (F9 / Epic 5) ──
  //
  // One id per wizard session, generated up front so every autosave is an upsert of
  // the same row instead of a new draft each time. Resuming reuses the id it was
  // given, so continuing a draft keeps writing back to the same record.
  const sessionDraftId = React.useRef(
    draftId ?? `DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  );
  const [restoring, setRestoring] = React.useState(Boolean(draftId));
  const [draftState, setDraftState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  // Step 1
  const [dateOfLoss, setDateOfLoss] = React.useState("");
  const [site, setSite] = React.useState("");
  const [claimType, setClaimType] = React.useState("Claim");

  // Step 2
  const [policies, setPolicies] = React.useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = React.useState(false);
  const [selectedPolicy, setSelectedPolicy] = React.useState("");

  // Step 3
  const [step3Values, setStep3Values] = React.useState<Record<string, string>>({});
  const [fnolGroups, setFnolGroups] = React.useState<FnolGroupSpec[]>([]);

  // Step 4
  const [files, setFiles] = React.useState<File[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);

  // Submission
  const [submitting, setSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{ aon_claim_id: string | null; state: string; message: string } | null>(null);

  // Hierarchy for site dropdown
  const { data: hierarchy } = useResource<{ nodes: HierarchyNode[] }>(
    (a) => a.get("/hierarchy"),
    []
  );

  // Load FNOL form groups from config
  React.useEffect(() => {
    fetch(`${(window as any).__API_URL__ ?? "http://localhost:8000"}/config/fnol-forms`)
      .catch(() => null)
      .then(() => {
        // Load all 11 product group configs from local config dir via API
        // In production this would be served by the API. For POC, import statically.
        import("../../fnol-config-loader").then((m) => setFnolGroups(m.ALL_GROUPS)).catch(() => {});
      });
  }, []);

  // Load policies when site + date change
  React.useEffect(() => {
    if (!site || !dateOfLoss) return;
    setLoadingPolicies(true);
    api.get<{ policies: Policy[] }>("/policies", { site, date_of_loss: dateOfLoss })
      .then((d) => setPolicies(d.policies))
      .catch(() => setPolicies([]))
      .finally(() => setLoadingPolicies(false));
  }, [site, dateOfLoss]);

  // Restore a saved draft before the user sees the form, so they never type into
  // fields that are about to be overwritten.
  React.useEffect(() => {
    if (!draftId) return;
    let alive = true;
    api.get<{ current_step: number; values: Record<string, unknown> }>(`/fnol/drafts/${draftId}`)
      .then((d) => {
        if (!alive) return;
        const v = d.values ?? {};
        if (typeof v.site_org_node === "string") setSite(v.site_org_node);
        if (typeof v.date_of_loss === "string") setDateOfLoss(v.date_of_loss);
        if (typeof v.claim_type === "string") setClaimType(v.claim_type);
        if (typeof v.policy_id === "string") setSelectedPolicy(v.policy_id);
        if (v.dynamic_fields && typeof v.dynamic_fields === "object") {
          setStep3Values(v.dynamic_fields as Record<string, string>);
        }
        if (Array.isArray(v.contacts)) setContacts(v.contacts as Contact[]);
        // current_step is 1-based on the wire, 0-based in this component.
        setStep(Math.max(0, Math.min(4, (d.current_step ?? 1) - 1)));
      })
      .catch(() => { /* a missing draft just starts a fresh wizard */ })
      .finally(() => { if (alive) setRestoring(false); });
    return () => { alive = false; };
  }, [draftId]);

  const selectedPolicyData = policies.find((p) => p.policy_id === selectedPolicy);
  const productLine = selectedPolicyData?.product_line ?? "";

  // Everything worth preserving between devices, in one place.
  const draftValues = React.useMemo(() => ({
    site_org_node: site,
    date_of_loss: dateOfLoss,
    claim_type: claimType,
    policy_id: selectedPolicy || null,
    product_line: productLine || null,
    loss_description: step3Values.loss_description ?? "",
    cause_of_loss: step3Values.cause_of_loss ?? "",
    dynamic_fields: step3Values,
    contacts,
    // Attached files are deliberately not persisted: a File handle cannot be
    // serialised, and re-uploading on resume is safer than implying we kept them.
  }), [site, dateOfLoss, claimType, selectedPolicy, productLine, step3Values, contacts]);

  const hasDraftContent = Boolean(site || dateOfLoss || step3Values.loss_description);

  const saveDraft = React.useCallback(async (): Promise<boolean> => {
    if (!hasDraftContent) return false;
    setDraftState("saving");
    try {
      await api.put(`/fnol/drafts/${sessionDraftId.current}`, {
        site_org_node: site || null,
        label: step3Values.loss_description?.slice(0, 80) || null,
        current_step: step + 1,
        last_device: currentDeviceLabel(),
        values: draftValues,
      });
      setDraftState("saved");
      setSavedAt(new Date().toISOString());
      return true;
    } catch {
      setDraftState("error");
      return false;
    }
  }, [api, site, step, step3Values.loss_description, draftValues, hasDraftContent]);

  // Autosave on step change rather than on keystroke: a step boundary is a natural
  // checkpoint, and it keeps this to one request per transition instead of dozens.
  const lastSavedStep = React.useRef(step);
  React.useEffect(() => {
    if (restoring || receipt) return;
    if (lastSavedStep.current === step) return;
    lastSavedStep.current = step;
    void saveDraft();
  }, [step, restoring, receipt, saveDraft]);

  function handleStep3Change(key: string, value: string | boolean) {
    setStep3Values((prev) => ({ ...prev, [key]: String(value) }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await api.post<any>("/fnol", {
        site_org_node: site,
        date_of_loss: dateOfLoss,
        claim_type: claimType,
        policy_id: selectedPolicy || null,
        product_line: productLine || null,
        loss_description: step3Values.loss_description ?? "",
        cause_of_loss: step3Values.cause_of_loss ?? "",
        named_insured: step3Values.named_insured ?? "",
        loss_country: step3Values.loss_country ?? "",
        client_claim_ref: step3Values.client_claim_ref ?? "",
        dynamic_fields: step3Values,
        contacts,
        document_ids: [],
      }, { "Idempotency-Key": idempotencyKey });
      setReceipt(result);
      // The intake is now in the outbox, so the draft has served its purpose.
      // Failure here is not worth surfacing: the claim is submitted either way and a
      // stale draft is recoverable from the Drafts tab.
      await api.del(`/fnol/drafts/${sessionDraftId.current}`).catch(() => {});
    } catch (err: any) {
      setReceipt({ aon_claim_id: null, state: "error", message: err?.message ?? "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  }

  const steps = STEP_KEYS.map((k) => ({ id: k, label: tr(k) }));

  const canProceedStep1 = !!(dateOfLoss && site && claimType);
  const canProceedStep2 = !!selectedPolicy;
  const canProceedStep3 = !!(step3Values.loss_description && step3Values.cause_of_loss && step3Values.loss_country);

  if (restoring) {
    return (
      <div style={{ padding: t.space(10), display: "grid", placeItems: "center" }}>
        <Spinner label={tr("drafts.restoring")} />
      </div>
    );
  }

  // ── Receipt screen ──
  if (receipt) {
    const success = receipt.state !== "error";
    return (
      <Card title={success ? "Claim Submitted" : "Submission Error"}>
        <Banner tone={success ? "success" : "error"} title={receipt.aon_claim_id ? `Aon Claim ID: ${receipt.aon_claim_id}` : receipt.state === "queued" ? "Claim received — reference pending" : "Error"}>
          {receipt.message}
        </Banner>
        {receipt.state === "queued" && (
          <Banner tone="info" title="Resilient submission (NFR-37)">
            Claims Copilot was unavailable at submission time. Your claim is securely queued. You will receive your Aon Claim ID by email once the system reconciles.
          </Banner>
        )}
        <div style={{ marginTop: t.space(4), display: "flex", gap: t.space(3) }}>
          <Button onClick={() => nav.toList()}>View My Claims</Button>
          <Button variant="secondary" onClick={() => nav.toLanding()}>Back to Overview</Button>
        </div>
      </Card>
    );
  }

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
        actions={
          <span style={{ display: "flex", alignItems: "center", gap: t.space(3) }}>
            {/* Autosave status, so the user can tell the draft is actually safe. */}
            <span
              role="status" aria-live="polite"
              style={{
                font: `${t.font.size.xs} ${t.font.family}`,
                color: draftState === "error" ? t.color.red500 : t.color.grey500,
              }}
            >
              {draftState === "saving" ? tr("drafts.saving")
                : draftState === "error" ? tr("drafts.save_failed")
                : draftState === "saved" && savedAt ? tr("drafts.saved_at", {
                    when: dateTime(savedAt, api.locale),
                  })
                : ""}
            </span>
            <Button
              variant="secondary"
              disabled={!hasDraftContent}
              disabledReason={tr("drafts.nothing_to_save")}
              onClick={async () => {
                const ok = await saveDraft();
                if (ok) nav.toList("drafts");
              }}
            >
              {tr("common.save_exit")}
            </Button>
          </span>
        }
      />

      <Card style={{ marginBottom: t.space(4) }}>
        <Stepper steps={steps} current={step} onStepClick={(i) => {
          // Only allow navigating backward; forward requires Continue.
          if (i < step) setStep(i);
        }} />
      </Card>

      <Card title={tr("fnol.step_of", { current: step + 1, total: steps.length, label: steps[step].label })}>
        {step === 0 && (
          <Step1
            dateOfLoss={dateOfLoss} setDateOfLoss={setDateOfLoss}
            site={site} setSite={setSite}
            claimType={claimType} setClaimType={setClaimType}
            sites={hierarchy?.nodes ?? []}
          />
        )}
        {step === 1 && (
          <Step2
            policies={policies} loading={loadingPolicies}
            selectedPolicy={selectedPolicy} setSelectedPolicy={setSelectedPolicy}
          />
        )}
        {step === 2 && (
          <Step3
            values={step3Values} onChange={handleStep3Change}
            fnolGroups={fnolGroups} productLine={productLine}
          />
        )}
        {step === 3 && (
          <Step4
            files={files} setFiles={setFiles}
            contacts={contacts} setContacts={setContacts}
          />
        )}
        {step === 4 && (
          <Step5
            step1={{ dateOfLoss, site, claimType }}
            selectedPolicy={selectedPolicy} policies={policies}
            step3Values={step3Values} contacts={contacts} files={files}
            onSubmit={handleSubmit} submitting={submitting}
          />
        )}

        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: t.space(5),
          paddingTop: t.space(4), borderTop: `1px solid ${t.color.grey200}`,
        }}>
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            &larr; {tr("common.back")}
          </Button>
          {step < 4 && (
            <Button
              disabled={
                (step === 0 && !canProceedStep1) ||
                (step === 1 && !canProceedStep2) ||
                (step === 2 && !canProceedStep3)
              }
              disabledReason={tr("fnol.incomplete")}
              onClick={() => setStep((s) => s + 1)}
            >
              {tr("fnol.continue")} →
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
