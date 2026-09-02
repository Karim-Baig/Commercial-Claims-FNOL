/**
 * Static import of all 11 FNOL product group schemas.
 *
 * In production these would be served by the API (hot-reloadable, NFR-45).
 * For the POC they are bundled with the MFE so no additional server fetch is
 * needed during the demo — the engine still reads them at runtime from this
 * array, so adding a new group is still a JSON-only change.
 */
import type { FnolGroupSpec } from "./screens/fnol/DynamicFormEngine";

const core = {
  dynamic_category: "Core Loss Details",
  applies_when: { always: true },
  label_token: "fnol.group.core",
  fields: [],
} as FnolGroupSpec;

const propertyEquipment: FnolGroupSpec = {
  dynamic_category: "Property & Equipment",
  applies_when: { product_line: ["Property", "Property & Equipment"] },
  label_token: "fnol.group.property_equipment",
  fields: [
    { key: "first_or_third_party", type: "select", required: true, options: ["First Party", "Third Party"] },
    { key: "cause_of_loss", type: "select", required: true, options: ["Fire", "Flood / Water", "Storm / Wind", "Theft", "Vandalism", "Impact Damage", "Subsidence", "Accidental Damage", "Power Surge", "Other"] },
    { key: "item_name", type: "text" },
    { key: "serial_inventory_number", type: "text" },
    { key: "owner_contact", type: "text", pii: true },
    { key: "damage_description", type: "textarea", max_length: 1000 },
    { key: "owner_contact_notes", type: "textarea" },
    { key: "property_still_at_risk", type: "select", options: ["Yes — Further Damage Possible", "No — Secured / Mitigated"] },
    { key: "temp_repairs_undertaken", type: "select", options: ["Yes", "No"] },
    { key: "estimated_loss_value", type: "number" },
  ],
};

const vehicle: FnolGroupSpec = {
  dynamic_category: "Vehicle Details",
  applies_when: { product_line: ["Motor", "Motor Fleet", "Vehicle"] },
  label_token: "fnol.group.vehicle",
  fields: [
    { key: "vehicle_registration", type: "text", required: true },
    { key: "accident_location", type: "text", required: true, hint: "Full address or location where the accident occurred" },
    { key: "vehicle_make", type: "text" },
    { key: "vehicle_model", type: "text" },
    { key: "vehicle_year", type: "number" },
    { key: "driver_name", type: "text", pii: true },
    { key: "driver_license", type: "text", pii: true },
    { key: "injuries_reported", type: "select", options: ["Yes", "No"] },
    { key: "vehicle_driveable", type: "select", options: ["Yes", "No", "Unknown"] },
    { key: "third_party_involved", type: "select", options: ["Yes", "No"] },
    { key: "third_party_insurer", type: "text" },
    { key: "police_report_number", type: "text" },
  ],
};

const cyber: FnolGroupSpec = {
  dynamic_category: "Cyber",
  applies_when: { product_line: ["Cyber"] },
  label_token: "fnol.group.cyber",
  fields: [
    { key: "incident_type", type: "select", required: true, options: ["Ransomware", "Data Breach", "Business Email Compromise", "DDoS", "System Intrusion", "Phishing", "Other"] },
    { key: "systems_affected", type: "textarea", max_length: 500 },
    { key: "records_compromised", type: "number" },
    { key: "incident_detected_date", type: "date" },
    { key: "forensic_vendor", type: "text" },
    { key: "regulatory_notification_required", type: "select", options: ["Yes", "No", "Under review"] },
    { key: "ransom_demand_amount", type: "number" },
    { key: "ransom_paid", type: "select", options: ["Yes", "No"] },
    { key: "law_enforcement_notified", type: "select", options: ["Yes", "No"] },
  ],
};

const litigation: FnolGroupSpec = {
  dynamic_category: "Litigation",
  applies_when: { product_line: ["Litigation", "General Liability"] },
  label_token: "fnol.group.litigation",
  fields: [
    { key: "claimant_name", type: "text", required: true, pii: true },
    { key: "claimant_address", type: "text", pii: true },
    { key: "claimant_attorney", type: "text", pii: true },
    { key: "claimant_attorney_firm", type: "text" },
    { key: "date_of_service", type: "date" },
    { key: "response_deadline", type: "date", hint: "Date by which the insured must formally respond to the proceedings" },
    { key: "court_jurisdiction", type: "text" },
    { key: "case_number", type: "text" },
    { key: "demand_amount", type: "number" },
    { key: "alleged_injury_type", type: "select", options: ["Bodily Injury", "Property Damage", "Financial Loss", "Reputational", "Other"] },
    { key: "alleged_injury_desc", type: "textarea", max_length: 1000 },
    { key: "insured_attorney", type: "text" },
    { key: "insured_attorney_firm", type: "text" },
    { key: "litigation_stage", type: "select", options: ["Pre-litigation", "Suit Filed", "Discovery", "Trial", "Appeal", "Settled"] },
    { key: "statute_of_limitations", type: "date" },
  ],
};

const marine: FnolGroupSpec = {
  dynamic_category: "Marine",
  applies_when: { product_line: ["Marine", "Marine Cargo", "Marine Hull"] },
  label_token: "fnol.group.marine",
  fields: [
    { key: "vessel_name", type: "text" },
    { key: "vessel_flag", type: "text" },
    { key: "voyage_from", type: "text", required: true },
    { key: "voyage_to", type: "text", required: true },
    { key: "bill_of_lading", type: "text" },
    { key: "cargo_description", type: "textarea", max_length: 500, required: true },
    { key: "cargo_value", type: "number" },
    { key: "port_of_incident", type: "text" },
    { key: "incident_type", type: "select", options: ["Collision", "Grounding", "Fire", "Flooding", "Piracy", "Theft", "Contamination", "Other"] },
    { key: "surveyor_appointed", type: "text" },
    { key: "salvage_arranged", type: "select", options: ["Yes", "No", "Not Applicable"] },
    { key: "general_average_declared", type: "select", options: ["Yes", "No", "Under Assessment"] },
  ],
};

const entertainment: FnolGroupSpec = {
  dynamic_category: "Entertainment",
  applies_when: { product_line: ["Entertainment", "Event Cancellation"] },
  label_token: "fnol.group.entertainment",
  fields: [
    { key: "event_name", type: "text", required: true },
    { key: "event_date", type: "date", required: true },
    { key: "event_venue", type: "text" },
    { key: "cancellation_reason", type: "select", options: ["Weather", "Artist / Performer", "Government Order", "Force Majeure", "Technical Failure", "Other"] },
    { key: "ticket_revenue_at_risk", type: "number" },
    { key: "rescheduled_date", type: "date" },
  ],
};

const elWc: FnolGroupSpec = {
  dynamic_category: "EL / WC",
  applies_when: { product_line: ["Employers Liability", "Workers Compensation", "EL / WC"] },
  label_token: "fnol.group.el_wc",
  fields: [
    { key: "employee_job_title", type: "text", required: true, hint: "Job title at time of incident" },
    { key: "nature_of_injury", type: "select", required: true, options: ["Fracture", "Sprain / Strain", "Laceration / Cut", "Burns", "Contusion / Bruising", "Eye Injury", "Hearing Loss", "Occupational Illness / Disease", "Other"] },
    { key: "body_part_affected", type: "text" },
    { key: "medical_treatment", type: "select", options: ["None Required", "First Aid Only", "GP / Doctor Visit", "Hospital A&E", "Hospital Admission", "Ongoing Treatment"] },
    { key: "supervisor_name", type: "text", pii: true },
  ],
};

const liability: FnolGroupSpec = {
  dynamic_category: "Liability",
  applies_when: { product_line: ["General Liability", "Public Liability", "Products Liability"] },
  label_token: "fnol.group.liability",
  fields: [
    { key: "liability_type", type: "select", required: true, options: ["Public / General", "Products", "Professional", "Contractual", "Environmental", "Other"] },
    { key: "incident_location", type: "text", hint: "Address or location where the liability-giving event occurred" },
    { key: "claimant_address", type: "text", pii: true },
  ],
};

const construction: FnolGroupSpec = {
  dynamic_category: "Construction",
  applies_when: { product_line: ["Construction", "CAR", "EAR", "Contractors All Risk"] },
  label_token: "fnol.group.construction",
  fields: [
    { key: "project_name", type: "text", required: true, hint: "Name or reference of the construction project" },
    { key: "contract_value", type: "number" },
    { key: "construction_stage", type: "select", options: ["Pre-commencement", "Foundation / Groundworks", "Structural Frame", "Internal Fit-out", "Finishing / Commissioning", "Completed — Defects Period"] },
    { key: "subcontractor_involved", type: "select", options: ["Yes", "No"] },
    { key: "hse_notified", type: "select", options: ["Yes", "No", "Not Required"] },
  ],
};

const lossCircumstances: FnolGroupSpec = {
  dynamic_category: "Loss Circumstances",
  applies_when: { always: true },
  label_token: "fnol.group.loss_circumstances",
  fields: [
    { key: "estimated_loss_amount", type: "number", hint: "Preliminary estimate in policy currency — can be revised by the adjuster" },
    { key: "loss_severity", type: "select", options: ["Minor", "Moderate", "Significant", "Major", "Catastrophic"] },
    { key: "emergency_services_called", type: "select", options: ["No", "Yes — Police", "Yes — Fire Service", "Yes — Ambulance", "Yes — Multiple Services"] },
    { key: "witness_details", type: "text", hint: "Name and contact information of any witnesses" },
    { key: "weather_conditions", type: "select", options: ["Clear", "Rain", "Snow / Ice", "Storm", "Fog", "Not applicable"] },
    { key: "area_of_accident", type: "text" },
    { key: "cctv_captured", type: "select", options: ["Yes", "No", "Unknown"] },
    { key: "consequence_of_loss", type: "select", options: ["Business Interruption", "Property Damage", "Bodily Injury", "Financial Loss", "Reputational Damage", "Other"] },
  ],
};

export const ALL_GROUPS: FnolGroupSpec[] = [
  propertyEquipment,
  vehicle,
  cyber,
  litigation,
  marine,
  entertainment,
  elWc,
  liability,
  construction,
  lossCircumstances,
];
