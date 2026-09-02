"""
Seed data.

Uses the RFP's own worked example: a multi-site hospitality and airport concessions
client whose claim profile is expressed as Airport -> Location -> Restaurant. Claim
volumes are distributed deliberately so a persona switch produces a visibly different
dataset - a demo where the numbers barely move does not make the point.
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

from . import settings
from .db import connect, execute, execute_many, query, query_one
from .services.geocode import resolve as geocode_resolve
from .schema import create_all

# ── clients ───────────────────────────────────────────────────────────────
# Two tenants, deliberately. One client proves nothing about isolation - the second
# exists so cross-tenant leakage is testable rather than assumed.
#
# CORP-HOSP is the RFP's own worked example (p. 39, p. 68): a multi-site hospitality
# and airport concessions client, claim profile Airport -> Location -> Restaurant.
# CORP-RETAIL is a second client in a different sector. It keeps the same three-level
# depth on purpose: variable hierarchy depth is Phase 2, and changing it here would
# entangle tenancy with a separate concern.
CLIENTS = [
    ("CORP-HOSP", "Hospitality Group Incorporated", "Hospitality Group Inc.", "active", "US"),
    ("CORP-RETAIL", "Northwind Retail Group plc", "Northwind Retail", "active", "GB"),
]

# ── organisational hierarchy ──────────────────────────────────────────────
ORG_NODES = [
    ("CORP-HOSP", None, "/CORP-HOSP/", "corporate", "Hospitality Group Inc.", "US"),
    ("LOC-JFK", "CORP-HOSP", "/CORP-HOSP/LOC-JFK/", "location", "JFK International", "US"),
    ("LOC-LHR", "CORP-HOSP", "/CORP-HOSP/LOC-LHR/", "location", "London Heathrow", "GB"),
    ("LOC-SIN", "CORP-HOSP", "/CORP-HOSP/LOC-SIN/", "location", "Singapore Changi", "SG"),
    ("SITE-JFK-T4-BISTRO", "LOC-JFK", "/CORP-HOSP/LOC-JFK/SITE-JFK-T4-BISTRO/", "site", "JFK T4 Bistro", "US"),
    ("SITE-JFK-T4-CAFE", "LOC-JFK", "/CORP-HOSP/LOC-JFK/SITE-JFK-T4-CAFE/", "site", "JFK T4 Cafe", "US"),
    ("SITE-JFK-T7-GRILL", "LOC-JFK", "/CORP-HOSP/LOC-JFK/SITE-JFK-T7-GRILL/", "site", "JFK T7 Grill", "US"),
    ("SITE-LHR-T2-DELI", "LOC-LHR", "/CORP-HOSP/LOC-LHR/SITE-LHR-T2-DELI/", "site", "LHR T2 Deli", "GB"),
    ("SITE-LHR-T5-BAR", "LOC-LHR", "/CORP-HOSP/LOC-LHR/SITE-LHR-T5-BAR/", "site", "LHR T5 Bar", "GB"),
    ("SITE-LHR-T3-KIOSK", "LOC-LHR", "/CORP-HOSP/LOC-LHR/SITE-LHR-T3-KIOSK/", "site", "LHR T3 Kiosk", "GB"),
    ("SITE-SIN-T1-NOODLE", "LOC-SIN", "/CORP-HOSP/LOC-SIN/SITE-SIN-T1-NOODLE/", "site", "Changi T1 Noodle Bar", "SG"),
    ("SITE-SIN-T3-LOUNGE", "LOC-SIN", "/CORP-HOSP/LOC-SIN/SITE-SIN-T3-LOUNGE/", "site", "Changi T3 Lounge", "SG"),
    ("SITE-SIN-T4-BAKERY", "LOC-SIN", "/CORP-HOSP/LOC-SIN/SITE-SIN-T4-BAKERY/", "site", "Changi T4 Bakery", "SG"),

    # ── second tenant ────────────────────────────────────────────────────────
    ("CORP-RETAIL", None, "/CORP-RETAIL/", "corporate", "Northwind Retail", "GB"),
    ("LOC-NW-NORTH", "CORP-RETAIL", "/CORP-RETAIL/LOC-NW-NORTH/", "location", "Northern Region", "GB"),
    ("LOC-NW-SOUTH", "CORP-RETAIL", "/CORP-RETAIL/LOC-NW-SOUTH/", "location", "Southern Region", "GB"),
    ("SITE-NW-LEEDS", "LOC-NW-NORTH", "/CORP-RETAIL/LOC-NW-NORTH/SITE-NW-LEEDS/", "site", "Leeds Superstore", "GB"),
    ("SITE-NW-YORK", "LOC-NW-NORTH", "/CORP-RETAIL/LOC-NW-NORTH/SITE-NW-YORK/", "site", "York Metro", "GB"),
    ("SITE-NW-BRISTOL", "LOC-NW-SOUTH", "/CORP-RETAIL/LOC-NW-SOUTH/SITE-NW-BRISTOL/", "site", "Bristol Superstore", "GB"),
]

NODE_LEVEL = {n[0]: n[3] for n in ORG_NODES}
NODE_NAME = {n[0]: n[4] for n in ORG_NODES}
NODE_PATH = {n[0]: n[2] for n in ORG_NODES}
NODE_COUNTRY = {n[0]: n[5] for n in ORG_NODES}

# Sites at or below each node. A claim booked at group or airport level still
# happened at one specific concession, and the record has to name it.
SITES_UNDER = {
    n[0]: [s[0] for s in ORG_NODES if s[3] == "site" and s[2].startswith(n[2])]
    for n in ORG_NODES
}

# Policies are placed at group and airport level; a site claim attaches to the
# policy held by its airport.
POLICY_NODE = {n[0]: (n[1] if n[3] == "site" else n[0]) for n in ORG_NODES}

# ── the seven personas from Exhibit 5 ─────────────────────────────────────
PERSONAS = [
    (1, "Sarah Whitfield", "C-Suite", "Executive level", "CORP-HOSP",
     "claims_viewer,claims_analytics,claims_export,claims_docs,claims_view_pii,claims_view_restricted"),
    (2, "Daniel Osei", "Risk Manager (Client Admin)", "Client administrator", "CORP-HOSP",
     "claims_viewer,claims_analytics,claims_export,claims_docs,claims_upload_docs,"
     "claims_view_pii,claims_view_restricted,claims_fnol,claims_client_admin"),
    (3, "Priya Raman", "Location Manager (Airport Director)", "Location manager", "LOC-JFK",
     "claims_viewer,claims_fnol,claims_docs,claims_upload_docs,claims_analytics"),
    (4, "Marcus Lindqvist", "Functional Lead (HRBP)", "Functional lead", "LOC-JFK",
     "claims_viewer,claims_fnol"),
    (5, "Maria Santos", "Manager (Restaurant Manager)", "Site manager", "SITE-JFK-T4-BISTRO",
     "claims_viewer,claims_fnol,claims_docs,claims_upload_docs"),
    (6, "Tom Beckett", "Employee / Reporter", "Reporter", "SITE-JFK-T4-BISTRO",
     "claims_fnol,claims_own_only"),
    (7, "Unassigned User", "Unauthorised User", "No entitlement", None, ""),

    # ── second tenant. Same privilege shapes, different client - so a test can
    # hold role constant and vary only the tenant. ─────────────────────────────
    (8, "Eleanor Vance", "C-Suite", "Executive level", "CORP-RETAIL",
     "claims_viewer,claims_analytics,claims_export,claims_docs,claims_view_pii,claims_view_restricted"),
    (9, "Raj Bhatia", "Regional Manager", "Location manager", "LOC-NW-NORTH",
     "claims_viewer,claims_fnol,claims_docs,claims_upload_docs,claims_analytics"),
    (10, "Fiona Clarke", "Store Manager", "Site manager", "SITE-NW-LEEDS",
     "claims_viewer,claims_fnol,claims_docs,claims_upload_docs"),
]

# ── Exhibit 5 field registry ──────────────────────────────────────────────
# (key, label_token, dynamic_category, pii, list, record, analytics, order, vis, type)
FIELDS = [
    ("aon_claim_id", "field.aon_claim_id", None, 0, 1, 1, 0, 1, "show", "text"),
    ("status", "field.status", None, 0, 1, 1, 1, 2, "show", "status"),
    ("sub_status", "field.sub_status", None, 0, 0, 1, 1, 3, "show", "text"),
    ("claim_type", "field.claim_type", None, 0, 0, 1, 1, 4, "show", "enum"),
    ("named_insured", "field.named_insured", None, 1, 1, 1, 0, 5, "show", "text"),
    ("client_claim_ref", "field.client_claim_ref", None, 0, 0, 1, 0, 6, "show", "text"),
    ("carrier_policy_number", "field.policy_number", None, 0, 1, 1, 0, 7, "show", "text"),
    ("global_product", "field.product_line", None, 0, 1, 1, 1, 8, "show", "text"),
    ("carrier", "field.lead_insurer", None, 0, 1, 1, 1, 9, "show", "text"),
    ("date_of_loss", "field.date_of_loss", None, 0, 1, 1, 1, 10, "show", "date"),
    ("loss_description", "field.loss_description", "Loss Description", 0, 1, 1, 0, 11, "show", "text"),
    ("aon_claim_lead", "field.aon_claim_lead", None, 0, 0, 1, 0, 12, "hide", "text"),
    ("gross_incurred", "field.gross_incurred", None, 0, 1, 1, 1, 13, "show", "money"),
    ("total_paid", "field.total_paid", None, 0, 0, 1, 1, 14, "show", "money"),
    ("total_outstanding", "field.total_outstanding", None, 0, 0, 1, 1, 15, "show", "money"),
    ("applicable_deductible", "field.deductible", None, 0, 0, 1, 0, 16, "show", "money"),
    ("sir_amount", "field.sir", None, 0, 0, 1, 0, 17, "show", "money"),
    ("cause_of_loss", "field.cause_of_loss", None, 0, 0, 1, 1, 18, "show", "text"),
    ("consequence_of_loss", "field.consequence_of_loss", "Loss Circumstances", 0, 0, 1, 1, 19, "show", "text"),
    ("loss_country", "field.loss_country", None, 0, 0, 1, 1, 20, "show", "text"),
    ("loss_city", "field.loss_city", None, 0, 0, 1, 1, 21, "show", "text"),
    ("loss_address", "field.loss_address", None, 1, 0, 1, 0, 22, "show", "text"),
    ("submitted_by", "field.submitter", None, 1, 1, 1, 0, 23, "show", "text"),
    ("submitted_at", "field.submission_date", None, 0, 0, 1, 0, 24, "show", "date"),
    ("date_reported_to_aon", "field.date_reported_to_aon", None, 0, 0, 1, 1, 25, "show", "date"),
    ("date_reported_to_carrier", "field.date_reported_to_carrier", None, 0, 0, 1, 1, 26, "show", "date"),

    # ── Exhibit 5 core claim field model (p. 68) ──────────────────────────
    # Most default to hidden: the registry governs which of ~75 available fields
    # a client actually sees, and a 75-column default list would be unusable.
    ('claim_profile', 'field.claim_profile', None, 0, 0, 1, 1, 30, 'show', 'text'),
    ('escalated', 'field.escalated', None, 0, 0, 1, 1, 31, 'show', 'enum'),
    ('disputed_claim', 'field.disputed_claim', None, 0, 0, 1, 1, 32, 'show', 'enum'),
    ('disputed_category', 'field.disputed_category', None, 0, 0, 1, 1, 33, 'hide', 'text'),
    ('client_name', 'field.client', None, 0, 0, 1, 1, 34, 'show', 'text'),
    ('entity_group', 'field.entity_group', None, 0, 0, 1, 1, 35, 'show', 'text'),
    ('reporting_line', 'field.reporting_line', None, 0, 0, 1, 1, 36, 'hide', 'text'),
    ('global_industry', 'field.global_industry', None, 0, 0, 1, 1, 37, 'hide', 'text'),
    ('global_sub_industry', 'field.global_sub_industry', None, 0, 0, 1, 1, 38, 'hide', 'text'),
    ('client_text_1', 'field.client_text_1', 'Client Specific', 0, 0, 1, 0, 60, 'hide', 'text'),
    ('client_text_2', 'field.client_text_2', 'Client Specific', 0, 0, 1, 0, 61, 'hide', 'text'),
    ('client_text_3', 'field.client_text_3', 'Client Specific', 0, 0, 1, 0, 62, 'hide', 'text'),
    ('client_text_4', 'field.client_text_4', 'Client Specific', 0, 0, 1, 0, 63, 'hide', 'text'),
    ('client_list_1', 'field.client_list_1', 'Client Specific', 0, 0, 1, 0, 64, 'hide', 'text'),
    ('client_list_2', 'field.client_list_2', 'Client Specific', 0, 0, 1, 0, 65, 'hide', 'text'),
    ('client_list_3', 'field.client_list_3', 'Client Specific', 0, 0, 1, 0, 66, 'hide', 'text'),
    ('client_list_4', 'field.client_list_4', 'Client Specific', 0, 0, 1, 0, 67, 'hide', 'text'),
    ('assigned_team', 'field.assigned_team', None, 0, 0, 1, 1, 39, 'show', 'text'),
    ('aon_office', 'field.aon_office', None, 0, 0, 1, 1, 40, 'show', 'text'),
    ('aon_ack_to_client_date', 'field.aon_ack_date', None, 0, 0, 1, 1, 41, 'show', 'date'),
    ('aon_claims_prep_engagement', 'field.aon_claims_prep', None, 0, 0, 1, 1, 42, 'hide', 'text'),
    ('routing_type', 'field.routing_type', None, 0, 0, 1, 1, 43, 'hide', 'text'),
    ('name_of_loss', 'field.name_of_loss', None, 0, 1, 1, 1, 44, 'show', 'text'),
    ('catastrophe', 'field.catastrophe', None, 0, 0, 1, 1, 45, 'show', 'text'),
    ('claims_made_date', 'field.claims_made_date', None, 0, 0, 1, 1, 46, 'hide', 'date'),
    ('date_insured_first_awareness', 'field.first_awareness', None, 0, 0, 1, 1, 47, 'hide', 'date'),
    ('prescription_date', 'field.prescription_date', None, 0, 0, 1, 1, 48, 'hide', 'date'),
    ('claim_closure_date', 'field.claim_closure_date', None, 0, 0, 1, 1, 49, 'show', 'date'),
    ('date_last_updated', 'field.date_last_updated', None, 0, 1, 1, 1, 50, 'show', 'date'),
    ('region', 'field.region', None, 0, 0, 1, 1, 51, 'show', 'text'),
    ('alternative_aon_region', 'field.alternative_aon_region', None, 0, 0, 1, 1, 52, 'hide', 'text'),
    ('country', 'field.country', None, 0, 0, 1, 1, 53, 'show', 'text'),
    ('loss_region', 'field.loss_region', None, 0, 0, 1, 1, 54, 'hide', 'text'),
    ('client_specific_1', 'field.client_specific_1', 'Client Specific', 0, 0, 1, 0, 68, 'hide', 'text'),
    ('client_specific_2', 'field.client_specific_2', 'Client Specific', 0, 0, 1, 0, 69, 'hide', 'text'),
    ('client_specific_3', 'field.client_specific_3', 'Client Specific', 0, 0, 1, 0, 70, 'hide', 'text'),
    ('client_specific_4', 'field.client_specific_4', 'Client Specific', 0, 0, 1, 0, 71, 'hide', 'text'),
    ('client_specific_5', 'field.client_specific_5', 'Client Specific', 0, 0, 1, 0, 72, 'hide', 'text'),
    ('client_specific_6', 'field.client_specific_6', 'Client Specific', 0, 0, 1, 0, 73, 'hide', 'text'),
    ('client_specific_7', 'field.client_specific_7', 'Client Specific', 0, 0, 1, 0, 74, 'hide', 'text'),
    ('client_specific_8', 'field.client_specific_8', 'Client Specific', 0, 0, 1, 0, 75, 'hide', 'text'),
    ('client_specific_9', 'field.client_specific_9', 'Client Specific', 0, 0, 1, 0, 76, 'hide', 'text'),
    ('client_specific_10', 'field.client_specific_10', 'Client Specific', 0, 0, 1, 0, 77, 'hide', 'text'),
    ('client_specific_11', 'field.client_specific_11', 'Client Specific', 0, 0, 1, 0, 78, 'hide', 'text'),
    ('client_specific_12', 'field.client_specific_12', 'Client Specific', 0, 0, 1, 0, 79, 'hide', 'text'),
    ('client_specific_13', 'field.client_specific_13', 'Client Specific', 0, 0, 1, 0, 80, 'hide', 'text'),
    ('client_specific_14', 'field.client_specific_14', 'Client Specific', 0, 0, 1, 0, 81, 'hide', 'text'),
]

PRODUCTS = [
    ("Property & Equipment", "Property", "Zurich"),
    ("Motor Fleet", "Motor", "AXA"),
    ("General Liability", "Casualty", "Chubb"),
    ("Cyber", "Specialty", "Beazley"),
    ("Marine Cargo", "Marine", "Allianz"),
    ("Employers Liability", "Casualty", "Travelers"),
]

STATUSES = [
    ("Open", "Awaiting documentation"),
    ("Under Review", "Adjuster assigned"),
    ("Reserve Set", "Reserve approved"),
    ("Closed", "Settled"),
]

# ── loss scenarios ────────────────────────────────────────────────────────
# A claim only reads correctly to a claims practitioner if the product line, the
# cause, the consequence and the narrative all describe one event. Drawing those
# four independently produces rows like "Ransomware affecting Grill operations"
# under a cause of "Escape of Water" on a Motor Fleet policy, so they are bound
# together here as whole scenarios and chosen as a unit.
# (cause_of_loss, consequence_of_loss, narrative template)
LOSS_SCENARIOS: dict[str, list[tuple[str, str, str]]] = {
    "Property & Equipment": [
        ("Escape of Water", "Property Damage",
         "Chilled water pipe failed in the ceiling void above the servery at {place}, "
         "flooding the counter line and dry store. Floor screed and joinery require replacement."),
        ("Escape of Water", "Business Interruption",
         "Mains feed to the wash-up area at {place} split overnight and went undetected "
         "until opening. Unit closed for six days while the structure was dried."),
        ("Fire", "Property Damage",
         "Fire in the extraction canopy at {place} spread into the ductwork before "
         "suppression activated. Canopy, ducting and part of the ceiling require replacement."),
        ("Fire", "Business Interruption",
         "Kitchen fire at {place} triggered a terminal evacuation. Trade was lost over the "
         "following nine days pending fire-safety sign-off and deep clean."),
        ("Storm Damage", "Property Damage",
         "Storm-driven rain penetrated the terminal roof above {place}, bringing down "
         "ceiling tiles and damaging lighting and the seating area."),
        ("Impact Damage", "Property Damage",
         "A ground-handling tug reversed into the shopfront glazing at {place} during an "
         "out-of-hours delivery. Glazing, frame and fascia signage damaged."),
        ("Equipment Breakdown", "Business Interruption",
         "Compressor failure on the walk-in refrigeration unit at {place}. Chilled and "
         "frozen stock was condemned and hot service suspended until a replacement was fitted."),
        ("Theft", "Property Damage",
         "Forced entry to the stockroom at {place} outside trading hours. Spirits stock and "
         "two tills were taken and the door frame was damaged."),
    ],
    "Motor Fleet": [
        ("Motor Collision", "Property Damage",
         "Insured catering van collided with a third-party vehicle on the service road while "
         "making a delivery to {place}. Both vehicles were recovered; front offside wing and door damaged."),
        ("Motor Collision", "Bodily Injury",
         "Insured delivery van was in collision at the perimeter roundabout en route to {place}. "
         "The third-party driver reported neck and shoulder injuries at the scene."),
        ("Motor Collision", "Property Damage",
         "Insured van rolled forward unattended in the loading bay at {place} and struck a "
         "parked third-party car. Minor damage to both vehicles."),
        ("Impact Damage", "Property Damage",
         "Insured van struck the height-restriction barrier entering the goods yard at {place}. "
         "Roof panel and refrigeration housing damaged."),
        ("Theft", "Property Damage",
         "Insured refrigerated van serving {place} was broken into overnight in the staff car "
         "park. Catering stock and the tail-lift control unit were stolen."),
    ],
    "General Liability": [
        ("Slip and Fall", "Bodily Injury",
         "A customer slipped on a wet floor near the drinks station at {place} and sustained a "
         "fractured wrist. Incident captured on CCTV; wet-floor signage was in place."),
        ("Slip and Fall", "Bodily Injury",
         "A passenger tripped on a raised floor tile at the entrance to {place}, sustaining "
         "facial injuries. Third-party solicitors have since been instructed."),
        ("Food-borne Illness", "Bodily Injury",
         "Four customers reported gastric illness after eating at {place} on the same trading "
         "day. Environmental Health was notified and menu samples retained for analysis."),
        ("Scald Injury", "Bodily Injury",
         "A customer was scalded on the hand and forearm by a hot beverage handed across the "
         "counter at {place}. Treated by the terminal medical centre."),
        ("Third Party Property Damage", "Property Damage",
         "A fryer oil spill at {place} tracked under the demise line into the adjoining retail "
         "unit, damaging their flooring and floor stock."),
        ("Escape of Water", "Third Party Liability",
         "Overflow from the wash-up area at {place} discharged into the retail unit below, "
         "damaging their stock and fittings. The third party has intimated a claim."),
    ],
    "Cyber": [
        ("Ransomware", "Business Interruption",
         "Ransomware encrypted the point-of-sale and back-office servers supporting {place}. "
         "Card payments were unavailable and trade was lost for four days while systems were "
         "rebuilt from backup."),
        ("Ransomware", "Financial Loss",
         "Ransomware deployed through a compromised supplier remote-access account reached the "
         "estate serving {place}. Incident response, forensics and data-recovery costs were "
         "incurred; no ransom was paid."),
        ("Data Breach", "Financial Loss",
         "Phishing compromise of a duty manager's mailbox at {place} exposed loyalty-scheme "
         "customer records. Forensic review completed and the regulator notified within 72 hours."),
        ("Funds Transfer Fraud", "Financial Loss",
         "Supplier bank details were altered by an impersonation email and two produce invoices "
         "for {place} were paid to the fraudulent account before the discrepancy was found."),
        ("System Outage", "Business Interruption",
         "A failed patch deployment took the till estate at {place} offline across a peak "
         "weekend. Sales reverted to manual card terminals and fell materially below forecast."),
    ],
    "Marine Cargo": [
        ("Cargo Damage in Transit", "Property Damage",
         "A refrigerated container of frozen goods consigned to {place} arrived with the reefer "
         "unit failed. The whole consignment was condemned by the port health authority."),
        ("Cargo Damage in Transit", "Property Damage",
         "Pallets of crockery and glassware for the {place} refit were crushed during handling "
         "at the port of discharge. Around a third of the consignment is unusable."),
        ("Cargo Damage in Transit", "Financial Loss",
         "Coffee stock consigned to {place} was water damaged after a hold breach in heavy "
         "weather. General average has been declared by the carrier."),
        ("Cargo Theft", "Property Damage",
         "A part shipment of wine and spirits consigned to {place} was found short on arrival. "
         "Container seals showed evidence of tampering at the transhipment port."),
    ],
    "Employers Liability": [
        ("Slip and Fall", "Bodily Injury",
         "A kitchen porter slipped on a wet floor in the wash-up area at {place} and sustained a "
         "lower back injury. Two weeks of lost time; RIDDOR assessment completed."),
        ("Slip and Fall", "Bodily Injury",
         "A barista fell on the stairwell carrying stock to the mezzanine store at {place}, "
         "fracturing an ankle. Extended absence with a phased return to work."),
        ("Burn Injury", "Bodily Injury",
         "A chef sustained burns to the forearm while filtering hot oil from the fryer at "
         "{place}. Treated on site and referred to hospital for a dressing clinic."),
        ("Manual Handling Injury", "Bodily Injury",
         "A team member injured their lower back lifting a stock delivery into the dry store at "
         "{place}. Referred to occupational health and placed on restricted duties."),
        ("Laceration", "Bodily Injury",
         "A team member sustained a deep laceration to the hand using a mandoline slicer at "
         "{place}. Attended hospital; the blade guard was found to be detached."),
    ],
}

# Severity, deductible and SIR all track the product line: a $2k motor claim behind a
# $25k deductible would never have been presented, and a $4k cyber claim is not credible.
SEVERITY_BY_PRODUCT = {
    "Property & Equipment": (8_000, 250_000),
    "Motor Fleet": (2_000, 35_000),
    "General Liability": (5_000, 120_000),
    "Cyber": (60_000, 600_000),
    "Marine Cargo": (6_000, 90_000),
    "Employers Liability": (4_000, 150_000),
}

DEDUCTIBLE_BY_PRODUCT = {
    "Property & Equipment": (10_000, 25_000),
    "Motor Fleet": (500, 1_000),
    "General Liability": (5_000, 10_000),
    "Cyber": (50_000, 100_000),
    "Marine Cargo": (2_500, 5_000),
    "Employers Liability": (5_000, 10_000),
}

# A self-insured retention is a casualty programme feature; it does not belong on the
# property or marine placements, and on cyber the retention is the deductible - carrying
# both at the same figure just reads as duplicated data.
SIR_BY_PRODUCT = {
    "General Liability": 50_000,
    "Employers Liability": 25_000,
}

# Real terminal addresses, so the loss location, the narrative and the map pin agree.
SITE_ADDRESS = {
    "SITE-JFK-T4-BISTRO": "Terminal 4, Departures Level, John F. Kennedy International Airport, Queens, NY 11430",
    "SITE-JFK-T4-CAFE": "Terminal 4, Arrivals Hall, John F. Kennedy International Airport, Queens, NY 11430",
    "SITE-JFK-T7-GRILL": "Terminal 7, Airside Concourse, John F. Kennedy International Airport, Queens, NY 11430",
    "SITE-LHR-T2-DELI": "Terminal 2, The Queen's Terminal, London Heathrow Airport, Hounslow TW6 1EW",
    "SITE-LHR-T5-BAR": "Terminal 5, Airside Level 2, London Heathrow Airport, Hounslow TW6 2GA",
    "SITE-LHR-T3-KIOSK": "Terminal 3, Departures Concourse, London Heathrow Airport, Hounslow TW6 1QG",
    "SITE-SIN-T1-NOODLE": "Terminal 1, Transit Mall Level 2, Singapore Changi Airport, 819642",
    "SITE-SIN-T3-LOUNGE": "Terminal 3, Departure Transit Lounge, Singapore Changi Airport, 819663",
    "SITE-SIN-T4-BAKERY": "Terminal 4, Central Galleria, Singapore Changi Airport, 819665",
    # ── second tenant ────────────────────────────────────────────────────────
    "SITE-NW-LEEDS": "Northwind Superstore, Crown Point Retail Park, Leeds LS10 1ET",
    "SITE-NW-YORK": "Northwind Metro, 12 Coppergate Walk, York YO1 9NT",
    "SITE-NW-BRISTOL": "Northwind Superstore, Cribbs Causeway, Bristol BS34 5DG",
}

LEADS = [
    ("M. Reeves", "m.reeves@aon.com"),
    ("K. Adeyemi", "k.adeyemi@aon.com"),
    ("L. Fontaine", "l.fontaine@aon.com"),
]

# Deliberate distribution so the persona switch is dramatic.
CLAIM_DISTRIBUTION = [
    ("SITE-JFK-T4-BISTRO", 3),
    ("SITE-JFK-T4-CAFE", 4),
    ("SITE-JFK-T7-GRILL", 3),
    ("LOC-JFK", 4),
    ("SITE-LHR-T2-DELI", 5),
    ("SITE-LHR-T5-BAR", 4),
    ("SITE-LHR-T3-KIOSK", 3),
    ("LOC-LHR", 5),
    ("SITE-SIN-T1-NOODLE", 5),
    ("SITE-SIN-T3-LOUNGE", 4),
    ("SITE-SIN-T4-BAKERY", 4),
    ("LOC-SIN", 4),
    ("CORP-HOSP", 12),

    # Second tenant. Kept smaller than the first so a leak shows up as an obvious
    # jump in totals rather than a subtle one.
    ("SITE-NW-LEEDS", 4),
    ("SITE-NW-YORK", 3),
    ("SITE-NW-BRISTOL", 3),
    ("LOC-NW-NORTH", 3),
    ("LOC-NW-SOUTH", 2),
    ("CORP-RETAIL", 5),
]

CURRENCY_BY_COUNTRY = {"US": "USD", "GB": "GBP", "SG": "SGD"}


def is_seeded() -> bool:
    """
    True only when every configured client has data.

    A plain "are there any claims" check was not enough: adding the second tenant left
    existing databases permanently on the old single-client seed, because the guard was
    already satisfied. The demo then showed "Unknown persona" for the new tenant, which
    reads as a bug rather than as stale data.

    Checking per client means a database created before a tenant existed converges on
    the next start. The generator is seeded with a fixed RNG, so the re-seed reproduces
    the original tenant's data rather than reshuffling it.
    """
    row = query_one("SELECT COUNT(*) AS n FROM claims")
    if not row or not row["n"]:
        return False

    expected = {c[0] for c in CLIENTS}
    present = {
        r["client_id"]
        for r in query("SELECT DISTINCT client_id FROM claims WHERE client_id IS NOT NULL")
    }
    # Rows predating the tenancy column carry NULL and are repaired by assign_tenancy(),
    # so an all-NULL database is treated as seeded rather than rebuilt from scratch.
    if not present:
        return True
    return expected.issubset(present)


def seed(force: bool = False) -> dict[str, int]:
    conn = connect()
    create_all(conn)

    if is_seeded() and not force:
        return {"skipped": 1}

    # A database that predates a newly configured client is incomplete rather than
    # empty. Rebuilding is the only safe move: inserting on top would collide on the
    # existing primary keys. The generator is deterministic, so the established
    # tenant's data comes back identical.
    existing = query_one("SELECT COUNT(*) AS n FROM claims")
    rebuild = force or bool(existing and existing["n"])

    if rebuild:
        for tbl in ("audit_log", "fnol_outbox", "documents", "claims",
                    "policies", "field_registry", "personas", "org_nodes",
                    "notifications", "user_preferences", "claim_messages",
                    "fnol_drafts", "clients", "saved_views", "claim_pins"):
            conn.execute(f"DELETE FROM {tbl}")
        conn.commit()

    execute_many(
        """INSERT INTO clients (client_id, legal_name, display_name, status, home_country)
           VALUES (:a, :b, :c, :d, :e)""",
        [dict(zip("abcde", r)) for r in CLIENTS],
    )

    execute_many(
        """INSERT INTO org_nodes (org_node, parent_node, path, level, display_name, country_code)
           VALUES (:a, :b, :c, :d, :e, :f)""",
        [dict(zip("abcdef", r)) for r in ORG_NODES],
    )

    execute_many(
        """INSERT INTO personas (persona_id, name, example_role, level, org_node, groups_csv)
           VALUES (:a, :b, :c, :d, :e, :f)""",
        [dict(zip("abcdef", r)) for r in PERSONAS],
    )

    execute_many(
        """INSERT INTO field_registry
           (field_key, label_token, dynamic_category, is_pii, show_on_claim_list,
            show_on_claim_record, show_on_client_analytics, c2s_order,
            default_visibility, value_type)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j)""",
        [dict(zip("abcdefghij", r)) for r in FIELDS],
    )

    # ── policies: one per product at group and airport level ──
    # Every product line is placed, so a claim can always be attached to the policy
    # that actually covers it rather than to an unrelated one picked at random.
    policies = []
    policy_index: dict[tuple[str, str], str] = {}
    pol_n = 88100
    for node, _p, _path, level, _name, cc in ORG_NODES:
        if level == "site":
            continue
        for i, (product, _cat, carrier) in enumerate(PRODUCTS):
            pol_n += 7
            pol_id = f"POL-{pol_n}"
            policy_index[(node, product)] = pol_id
            policies.append({
                "a": pol_id, "b": node, "c": carrier,
                "d": pol_id, "e": f"{i + 1:03d}", "f": "v2",
                "g": product, "h": "2026-01-01", "i": "2026-12-31",
                "j": 1, "k": LEADS[i % len(LEADS)][0], "l": LEADS[i % len(LEADS)][1],
            })
    execute_many(
        """INSERT INTO policies (policy_id, org_node, carrier_name, carrier_policy_number,
               cover_number, agreement_version, product_line, effective_date,
               expiration_date, active_for_fnol, aon_contact_name, aon_contact_email)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l)""",
        policies,
    )

    # ── claims ──
    rng = random.Random(20260821)  # deterministic so demos are repeatable
    claims, documents = [], []
    n = 0
    reporter_claim: str | None = None
    manager_claim: str | None = None
    today = date(2026, 8, 21)

    for node, count in CLAIM_DISTRIBUTION:
        for _ in range(count):
            n += 1
            cid = f"CLM-{n:04d}"
            product, category, carrier = rng.choice(PRODUCTS)
            status, sub = rng.choice(STATUSES)
            lead, lead_email = rng.choice(LEADS)
            dol = today - timedelta(days=rng.randint(5, 420))
            is_draft = 1 if (n % 23 == 0) else 0

            if node != "SITE-JFK-T4-BISTRO":
                submitter = "Daniel Osei"
            elif reporter_claim is None and not is_draft and n % 17 != 0:
                # Persona 6 holds claims_own_only, so it needs exactly one claim of
                # its own to see - otherwise the Reporter demo is an empty list.
                submitter = "Tom Beckett"
                reporter_claim = cid
            else:
                submitter = "Maria Santos"

            # The site-manager walkthrough - parked FNOL draft, adjuster thread, request
            # for a repair estimate - is a property story, so guarantee Persona 5 owns a
            # property claim for it to hang on.
            if submitter == "Maria Santos" and manager_claim is None and not is_draft:
                product, category, carrier = PRODUCTS[0]
                manager_claim = cid

            # The loss happened at one concession even when the claim is booked at
            # group or airport level, so the narrative, the address and the map pin
            # all resolve to the same place.
            site = node if NODE_LEVEL[node] == "site" else rng.choice(SITES_UNDER[node])
            cc = NODE_COUNTRY[site]
            currency = CURRENCY_BY_COUNTRY.get(cc, "USD")

            cause, consequence, narrative = rng.choice(LOSS_SCENARIOS[product])
            low, high = SEVERITY_BY_PRODUCT[product]
            incurred = round(rng.uniform(low, high), 2)
            paid = round(incurred * rng.uniform(0.0, 0.75), 2)
            # A claim presented with an incurred below its own deductible would never
            # have reached the carrier, so only offer retentions the loss exceeds.
            bands = DEDUCTIBLE_BY_PRODUCT[product]
            deductible = rng.choice([d for d in bands if d < incurred] or [min(bands)])
            geo = geocode_resolve(org_node=site, country_code=cc)

            claims.append({
                "a": cid, "b": node, "c": f"HG-2026-{n:04d}",
                "d": "Draft" if is_draft else status,
                "e": None if is_draft else sub,
                "f": "Incident" if n % 9 == 0 else "Claim",
                "g": is_draft, "h": product, "i": category, "j": carrier,
                "k": policy_index[(POLICY_NODE[node], product)],
                "l": "Hospitality Group Inc.",
                "m": dol.isoformat(),
                "n": (dol + timedelta(days=1)).isoformat(),
                "o": (dol + timedelta(days=3)).isoformat() if not is_draft else None,
                "p": 0.0 if is_draft else incurred,
                "q": 0.0 if is_draft else paid,
                "r": 0.0 if is_draft else round(incurred - paid, 2),
                "s": deductible,
                "t": SIR_BY_PRODUCT.get(product),
                "u": narrative.format(place=NODE_NAME[site]),
                "v": cause,
                "w": consequence,
                "x": cc, "y": {"US": "New York", "GB": "London", "SG": "Singapore"}[cc],
                "z": SITE_ADDRESS[site],
                "aa": lead, "ab": lead_email,
                "ac": 1 if n % 17 == 0 else 0,
                "ad": submitter,
                "ae": (dol + timedelta(days=1)).isoformat(),
                "af": currency,
                "ag": (geo.latitude if geo else None),
                "ah": (geo.longitude if geo else None),
            })

            # Documents: a deliberate mix so the Pillar 1 filter is observable.
            doc_specs = [
                ("Loss photographs.jpg", "Photograph", "client_visible", None, "view_on_web", 4_100_000),
                ("Repair invoice.pdf", "Invoice", "client_visible", None, "default", 240_000),
                ("Adjuster reserve note.pdf", "Internal Note", "internal", None, "internal", 88_000),
                ("Carrier submission.xml", "ACORD Message", "carrier_only", None, "access_controlled", 32_000),
            ]
            if n % 4 == 0:
                doc_specs.append(
                    ("Client policy schedule.pdf", "Policy", "client_visible",
                     "client_provided_via_claims", "default", 512_000)
                )
            for di, (dname, dtype, aud, prov, sec, size) in enumerate(doc_specs):
                documents.append({
                    "a": f"{cid}-D{di + 1}", "b": cid, "c": dname, "d": dtype,
                    "e": aud, "f": prov, "g": sec,
                    "h": f"ecm://filenet/claims/{cid}/{di + 1}",
                    "i": size, "j": (dol + timedelta(days=2)).isoformat(),
                })

    execute_many(
        """INSERT INTO claims (aon_claim_id, org_node, client_claim_ref, status, sub_status,
               claim_type, is_draft, global_product, global_product_category, carrier,
               carrier_policy_number, named_insured, date_of_loss, date_reported_to_aon,
               date_reported_to_carrier, gross_incurred, total_paid, total_outstanding,
               applicable_deductible, sir_amount, loss_description, cause_of_loss,
               consequence_of_loss, loss_country, loss_city, loss_address,
               aon_claim_lead, aon_claim_lead_email, restricted_access,
               submitted_by, submitted_at, currency_code,
               loss_latitude, loss_longitude)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o, :p, :q,
                   :r, :s, :t, :u, :v, :w, :x, :y, :z, :aa, :ab, :ac, :ad, :ae, :af,
                   :ag, :ah)""",
        claims,
    )

    execute_many(
        """INSERT INTO documents (doc_id, claim_id, doc_name, doc_type, audience,
               provenance, security_attr, ecm_reference, size_bytes, uploaded_at)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j)""",
        documents,
    )

    # ── notifications (seeded per persona for Epic 8 demo) ──
    from datetime import datetime, timezone
    import uuid as _uuid

    now_dt = datetime.now(timezone.utc)

    def _dt(days_ago: int, hours_ago: int = 0) -> str:
        from datetime import timedelta
        return (now_dt - timedelta(days=days_ago, hours=hours_ago)).isoformat(timespec="seconds")

    # Map persona_id → token subject. This must match the `sub` minted by
    # issue_mock_token ("poc|persona-N"); keying on the display name instead leaves
    # every recipient_sub unmatchable and the notification centre permanently empty.
    notif_rows = []
    persona_subs = {r[0]: f"poc|persona-{r[0]}" for r in PERSONAS}

    # Notifications are bound to claims that actually exist inside the recipient's own
    # scope and that the recipient is entitled to open. A hard-coded claim id either
    # does not exist or belongs to another airport, so clicking through from the
    # notification centre 403s in front of the audience.
    _SYMBOL = {"USD": "$", "GBP": "£", "SGD": "S$"}

    def _pick_notifiable(node: str, **match) -> dict | None:
        """First non-draft, non-restricted claim under `node` matching `match`."""
        prefix = NODE_PATH[node]
        for row in claims:
            if row["g"] or row["ac"]:          # draft, or restricted-access
                continue
            if not NODE_PATH[row["b"]].startswith(prefix):
                continue
            if all(row[k] == v for k, v in match.items()):
                return row
        return None

    def _pick_row(node: str, *filter_sets: dict) -> dict | None:
        """
        First claim under `node` matching any filter set, tried in order of how well it
        fits the message being attached to it, then anything viewable. Narrowing on the
        claim's own facts is what stops a business-interruption reserve conversation
        being attached to a bodily-injury claim.
        """
        for f in filter_sets:
            row = _pick_notifiable(node, **f)
            if row:
                return row
        return _pick_notifiable(node)

    def _amount(row: dict) -> str:
        return f"{_SYMBOL.get(row['af'], '')}{row['p']:,.0f}"

    corp_reserve = _pick_notifiable("CORP-HOSP", d="Reserve Set")
    corp_closed = _pick_notifiable("CORP-HOSP", d="Closed")
    corp_open = _pick_notifiable("CORP-HOSP", d="Open", w="Property Damage")
    jfk_reserve = _pick_notifiable("LOC-JFK", d="Reserve Set")
    jfk_review = _pick_notifiable("LOC-JFK", d="Under Review")
    bistro = _pick_row("SITE-JFK-T4-BISTRO", {"a": manager_claim})
    reporter = _pick_notifiable("SITE-JFK-T4-BISTRO", a=reporter_claim)

    def _ev(event_type, claim, title, body, read, dt) -> dict | None:
        if claim is None:
            return None
        return {"event_type": event_type, "claim_id": claim["a"],
                "title": title, "body": body, "read": read, "dt": dt}

    events_by_persona: dict[int, list[dict | None]] = {
        1: [  # C-Suite sees group-wide alerts
            _ev("reserve_set", corp_reserve,
                f"Reserve set on {corp_reserve['a']} · {_amount(corp_reserve)}" if corp_reserve else "",
                f"{corp_reserve['aa']} has set the reserve on this {corp_reserve['h']} claim." if corp_reserve else "",
                False, _dt(0, 2)),
            _ev("claim_closed", corp_closed,
                f"Claim {corp_closed['a']} closed" if corp_closed else "",
                f"{corp_closed['h']} claim settled at {_amount(corp_closed)}." if corp_closed else "",
                True, _dt(3)),
            _ev("document_requested", corp_open,
                f"Document requested on {corp_open['a']}" if corp_open else "",
                "Adjuster has requested the repair estimate before the reserve can be finalised." if corp_open else "",
                False, _dt(1)),
        ],
        2: [  # Risk Manager - same corpus, intake and reserve emphasis
            _ev("fnol_queued", bistro,
                "New FNOL submitted" if bistro else "",
                f"Maria Santos has submitted a new {bistro['h']} claim at {NODE_NAME[bistro['b']]}." if bistro else "",
                False, _dt(0, 1)),
            _ev("reserve_set", corp_reserve,
                f"Reserve set on {corp_reserve['a']}" if corp_reserve else "",
                f"Reserve of {_amount(corp_reserve)} approved by {corp_reserve['aa']}." if corp_reserve else "",
                False, _dt(0, 2)),
            _ev("document_requested", corp_open,
                f"Document requested on {corp_open['a']}" if corp_open else "",
                "Repair estimate required to progress the reserve." if corp_open else "",
                True, _dt(1)),
        ],
        3: [  # Location Manager - JFK scope only
            _ev("reserve_set", jfk_reserve,
                f"Reserve set on {jfk_reserve['a']}" if jfk_reserve else "",
                f"Reserve of {_amount(jfk_reserve)} set on this {jfk_reserve['h']} claim at "
                f"{NODE_NAME[jfk_reserve['b']]}." if jfk_reserve else "",
                False, _dt(0, 2)),
            _ev("status_changed", jfk_review,
                f"{jfk_review['a']} status changed to Under Review" if jfk_review else "",
                f"{jfk_review['aa']} has been assigned as claim lead." if jfk_review else "",
                True, _dt(2)),
        ],
        4: [  # Functional Lead - minimal notifications
            _ev("status_changed", jfk_review,
                f"{jfk_review['a']} status updated" if jfk_review else "",
                f"This {jfk_review['h']} claim is now Under Review." if jfk_review else "",
                False, _dt(2)),
        ],
        5: [  # Site Manager
            _ev("fnol_acknowledged", bistro,
                f"Claim {bistro['a']} registered" if bistro else "",
                f"Your claim has been registered. Aon Claim ID: {bistro['a']}." if bistro else "",
                False, _dt(0, 3)),
            _ev("document_requested", bistro,
                f"Document requested on {bistro['a']}" if bistro else "",
                "Please upload the contractor's repair estimate." if bistro else "",
                False, _dt(1)),
        ],
        6: [  # Reporter - own submissions only
            _ev("fnol_acknowledged", reporter,
                "Your claim has been registered" if reporter else "",
                f"Reference {reporter['a']}. Aon will be in touch." if reporter else "",
                False, _dt(0, 3)),
        ],
    }

    for pid, events in events_by_persona.items():
        sub = persona_subs.get(pid, "")
        node_map = {r[0]: r[4] for r in PERSONAS}
        org = node_map.get(pid)
        for ev in events:
            if ev is None:
                continue
            notif_rows.append({
                "a": str(_uuid.uuid4()),
                "b": sub,
                "c": org,
                "d": ev["event_type"],
                "e": ev["claim_id"],
                "f": ev["title"],
                "g": ev["body"],
                "h": 1 if ev["read"] else 0,
                "i": ev["dt"],
            })

    execute_many(
        """INSERT INTO notifications
               (notification_id, recipient_sub, org_node, event_type, claim_id,
                title, body, is_read, created_at)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i)""",
        notif_rows,
    )

    # ── F9: claim message threads (in-context adjuster messaging) ──
    #
    # Each thread mixes client correspondence with at least one Aon-internal note.
    # The internal rows exist precisely so the audience filter has something real to
    # withhold - the same demonstration the document proxy gives for Pillar 1.
    msg_rows: list[dict] = []

    def _msg(claim_id, org, sub, name, role, body, dt, audience="client_visible"):
        msg_rows.append({
            "a": str(_uuid.uuid4()), "b": claim_id, "c": org, "d": sub,
            "e": name, "f": role, "g": body, "h": audience, "i": dt,
        })

    # Threads are attached to claims picked out of the generated set rather than to
    # hard-coded ids. Claim numbering depends on the generator, so a literal id can
    # silently land outside every persona's scope - or not exist at all. The
    # consequence filters also keep each conversation about the loss it is attached to:
    # a business-interruption reserve discussion on a bodily-injury claim reads wrong.
    # The corporate thread discusses a loss adjuster's site visit, a forensic accountant
    # and a BI reserve movement; the JFK thread chases a contractor's repair estimate.
    _corp = _pick_row(
        "CORP-HOSP",
        {"w": "Business Interruption", "h": "Property & Equipment", "d": "Reserve Set"},
        {"w": "Business Interruption", "h": "Property & Equipment"},
        {"w": "Business Interruption"},
    )
    _jfk = _pick_row(
        "LOC-JFK",
        {"w": "Property Damage", "h": "Property & Equipment", "d": "Under Review"},
        {"w": "Property Damage", "d": "Under Review"},
        {"w": "Property Damage"},
    )
    corp_claim = _corp["a"] if _corp else None
    jfk_claim = _jfk["a"] if _jfk else None
    bistro_claim = bistro["a"] if bistro else None
    claim_org = {row["a"]: row["b"] for row in claims}

    # Corporate-scope thread: a reserve conversation for Personas 1 and 2.
    if corp_claim:
        org = claim_org[corp_claim]
        _msg(corp_claim, org, "aon|m.reeves", "Michael Reeves", "aon",
             "We have completed the loss adjuster's site visit and set an initial "
             "reserve. The full report will follow within five working days.", _dt(4))
        _msg(corp_claim, org, "poc|persona-2", "Daniel Osei", "client",
             "Thanks Michael. Could you confirm whether the business interruption "
             "element is included in that reserve figure?", _dt(3, 6))
        _msg(corp_claim, org, "aon|m.reeves", "Michael Reeves", "aon",
             "It is not - BI is being assessed separately and I expect a further "
             "reserve movement once the forensic accountant reports.", _dt(3))
        _msg(corp_claim, org, "aon|m.reeves", "Michael Reeves", "aon",
             "INTERNAL: carrier indicated a possible coinsurance dispute on the BI "
             "limb. Do not raise with the client until underwriting confirms.",
             _dt(2, 12), audience="internal")

    # Location-scope thread: gives Personas 3 and 4 a conversation inside JFK.
    if jfk_claim:
        org = claim_org[jfk_claim]
        _msg(jfk_claim, org, "aon|s.chen", "Sarah Chen", "aon",
             "We still need the repair estimate for this claim before the reserve can "
             "be finalised. Could you let me know when it is likely to reach us?",
             _dt(1, 2))
        _msg(jfk_claim, org, "poc|persona-3", "Priya Raman", "client",
             "The contractor is attending on Thursday, so I should be able to send it "
             "to you by Friday morning.", _dt(1))

    # Site-scope thread: reaches Persona 5 at the Bistro.
    if bistro_claim:
        org = claim_org[bistro_claim]
        _msg(bistro_claim, org, "aon|s.chen", "Sarah Chen", "aon",
             "Your claim has been registered and assigned to me. Please upload the "
             "repair estimate when you have it and I will progress the reserve.",
             _dt(2))
        _msg(bistro_claim, org, "poc|persona-5", "Maria Santos", "client",
             "Estimate from the contractor is attached. They can start next Monday if "
             "that works for the adjuster's inspection.", _dt(1, 4))
        _msg(bistro_claim, org, "aon|s.chen", "Sarah Chen", "aon",
             "Monday works. I have asked the adjuster to attend that morning.", _dt(1))
        _msg(bistro_claim, org, "aon|s.chen", "Sarah Chen", "aon",
             "INTERNAL: contractor quote looks ~15% above market for this scope. "
             "Flagging for desk review before we agree the settlement.", _dt(0, 20),
             audience="internal")

    execute_many(
        """INSERT INTO claim_messages
               (message_id, claim_id, org_node, author_sub, author_name,
                author_role, body, audience, created_at)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i)""",
        msg_rows,
    )

    # ── F9: a draft parked mid-wizard, to demonstrate cross-device resume ──
    #
    # Seeded against Persona 5 with a device label from a different machine, so the
    # "continue where you left off" path is demonstrable on first login rather than
    # requiring the reviewer to abandon a wizard themselves first.
    draft_rows = [{
        "a": "DRAFT-SEED-0001",
        "b": "poc|persona-5",
        "c": "SITE-JFK-T4-BISTRO",
        "d": "SITE-JFK-T4-BISTRO",
        "e": "Water ingress — kitchen ceiling",
        "f": json.dumps({
            "site_org_node": "SITE-JFK-T4-BISTRO",
            "date_of_loss": (now_dt - timedelta(days=2)).date().isoformat(),
            "claim_type": "Claim",
            "product_line": "Property & Equipment",
            "loss_description": "Water ingress through the kitchen ceiling after heavy "
                                "rain. Ceiling tiles down, prep area out of use.",
            "cause_of_loss": "Escape of Water",
            "dynamic_fields": {},
            "contacts": [],
        }),
        "g": 3,
        "h": "Chrome on Windows (Terminal 4 office)",
        "i": _dt(1, 3),
        "j": _dt(0, 5),
    }]

    execute_many(
        """INSERT INTO fnol_drafts
               (draft_id, owner_sub, org_node, site_org_node, label, payload_json,
                current_step, last_device, created_at, updated_at)
           VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j)""",
        draft_rows,
    )

    return {
        "org_nodes": len(ORG_NODES),
        "personas": len(PERSONAS),
        "fields": len(FIELDS),
        "policies": len(policies),
        "claims": len(claims),
        "documents": len(documents),
        "notifications": len(notif_rows),
        "claim_messages": len(msg_rows),
        "fnol_drafts": len(draft_rows),
    }


# Exhibit 5 lookup values used by the backfill below.
_REGIONS = {"US": "North America", "GB": "EMEA", "SG": "APAC"}
_ALT_REGIONS = {"US": "Americas", "GB": "UK & Ireland", "SG": "Asia"}
_OFFICES = {"US": "New York", "GB": "London", "SG": "Singapore"}
_TEAMS = ["CRS Property Team", "CRS Casualty Team", "CRS Specialty Team"]
_ROUTING = ["Standard", "Notify Direct to Carrier", "Aon Managed"]
_PROFILES = ["Airport Concessions", "Corporate Programme", "Site Level"]
_DISPUTE_CATS = ["Coverage", "Quantum", "Liability"]


def assign_tenancy() -> dict[str, int]:
    """
    Derives client_id for every tenant-scoped row.

    The hierarchy is the source of truth: a node's tenant is the first segment of its
    materialised path, and everything else inherits from the node or claim it hangs
    off. Running it as a backfill rather than threading client_id through a dozen
    positional INSERTs keeps the seed readable, and mirrors how a real migration would
    populate the column on an existing database.

    Idempotent - only rows with a NULL client_id are touched.
    """
    from .db import query

    applied: dict[str, int] = {}

    def count(sql: str, params: dict | None = None) -> int:
        rows = query(sql, params or {})
        return rows[0]["n"] if rows else 0

    # 1. org_nodes: tenant is the first path segment, e.g. /CORP-HOSP/... -> CORP-HOSP
    pending = query(
        "SELECT org_node, path FROM org_nodes WHERE client_id IS NULL"
    )
    for r in pending:
        root = r["path"].strip("/").split("/")[0]
        execute(
            "UPDATE org_nodes SET client_id = :c WHERE org_node = :n",
            {"c": root, "n": r["org_node"]},
        )
    if pending:
        applied["org_nodes"] = len(pending)

    # 2. tables keyed directly on org_node
    for table in ("claims", "policies", "saved_views", "claim_messages", "personas"):
        n = count(
            f"SELECT COUNT(*) AS n FROM {table} "
            f"WHERE client_id IS NULL AND org_node IS NOT NULL"
        )
        if n:
            execute(
                f"""UPDATE {table} SET client_id = (
                        SELECT o.client_id FROM org_nodes o WHERE o.org_node = {table}.org_node
                    )
                    WHERE client_id IS NULL AND org_node IS NOT NULL"""
            )
            applied[table] = n

    # 3. tables keyed on a claim
    for table, col in (("documents", "claim_id"), ("claim_pins", "claim_id")):
        n = count(
            f"SELECT COUNT(*) AS n FROM {table} WHERE client_id IS NULL AND {col} IS NOT NULL"
        )
        if n:
            execute(
                f"""UPDATE {table} SET client_id = (
                        SELECT c.client_id FROM claims c WHERE c.aon_claim_id = {table}.{col}
                    )
                    WHERE client_id IS NULL AND {col} IS NOT NULL"""
            )
            applied[table] = n

    # 4. notifications and drafts carry org_node on some rows and a claim on others
    for table in ("notifications", "fnol_drafts", "fnol_outbox"):
        cols = {r["name"] for r in query(f"PRAGMA table_info({table})")}
        if "org_node" in cols:
            n = count(
                f"SELECT COUNT(*) AS n FROM {table} "
                f"WHERE client_id IS NULL AND org_node IS NOT NULL"
            )
            if n:
                execute(
                    f"""UPDATE {table} SET client_id = (
                            SELECT o.client_id FROM org_nodes o
                            WHERE o.org_node = {table}.org_node
                        )
                        WHERE client_id IS NULL AND org_node IS NOT NULL"""
                )
                applied[table] = applied.get(table, 0) + n

    # 5. user_preferences are keyed on the token subject, which maps to a persona
    n = count(
        "SELECT COUNT(*) AS n FROM user_preferences WHERE client_id IS NULL"
    )
    if n:
        execute(
            """UPDATE user_preferences SET client_id = (
                   SELECT p.client_id FROM personas p
                   WHERE 'poc|persona-' || p.persona_id = user_preferences.user_sub
               )
               WHERE client_id IS NULL"""
        )
        applied["user_preferences"] = n

    return applied


def backfill_exhibit5_fields() -> int:
    """
    Populates the Exhibit 5 core claim fields (p. 68) on any claim that lacks them.

    Values are derived from data already on the row - country, product, status - so the
    claim record reads coherently rather than showing lorem ipsum. Client-specific
    extension fields are left sparse on purpose: they are client-configured in reality,
    and a fully populated set of 14 would misrepresent how they are used.
    """
    import hashlib

    from .db import query

    rows = query(
        "SELECT aon_claim_id, org_node, loss_country, loss_city, global_product, "
        "global_product_category, status, date_of_loss, date_reported_to_aon, "
        "named_insured, cause_of_loss, assigned_team "
        "FROM claims WHERE assigned_team IS NULL"
    )

    for r in rows:
        cc = (r["loss_country"] or "US").upper()
        seed = hashlib.sha256(r["aon_claim_id"].encode()).digest()
        pick = lambda lst, i: lst[seed[i] % len(lst)]  # noqa: E731
        closed = (r["status"] or "").lower() == "closed"
        disputed = seed[9] % 11 == 0
        escalated = seed[10] % 7 == 0

        # Closure sits a plausible interval after the report date rather than on it.
        # Setting closure = date_reported_to_aon gave every closed claim a one-day
        # lifecycle, which makes any cycle-time measure read as a constant.
        closure_date = None
        if closed and r["date_reported_to_aon"]:
            try:
                reported = date.fromisoformat(str(r["date_reported_to_aon"])[:10])
                # 21-200 days, deterministic per claim so reseeding is stable.
                closure_date = (
                    reported + timedelta(days=21 + (seed[11] % 180))
                ).isoformat()
            except ValueError:
                closure_date = r["date_reported_to_aon"]

        execute(
            """UPDATE claims SET
                 claim_profile = :profile,
                 escalated = :escalated,
                 disputed_claim = :disputed,
                 disputed_category = :dispute_cat,
                 client_name = :client,
                 entity_group = :entity_group,
                 reporting_line = :reporting_line,
                 global_industry = :industry,
                 global_sub_industry = :sub_industry,
                 assigned_team = :team,
                 aon_office = :office,
                 aon_ack_to_client_date = :ack_date,
                 aon_claims_prep_engagement = :prep,
                 routing_type = :routing,
                 name_of_loss = :name_of_loss,
                 catastrophe = :catastrophe,
                 claims_made_date = :claims_made,
                 date_insured_first_awareness = :first_aware,
                 prescription_date = :prescription,
                 claim_closure_date = :closure,
                 date_last_updated = :last_updated,
                 region = :region,
                 alternative_aon_region = :alt_region,
                 country = :country,
                 loss_region = :loss_region
               WHERE aon_claim_id = :cid""",
            {
                "cid": r["aon_claim_id"],
                "profile": pick(_PROFILES, 0),
                "escalated": 1 if escalated else 0,
                "disputed": 1 if disputed else 0,
                "dispute_cat": pick(_DISPUTE_CATS, 1) if disputed else None,
                "client": "Hospitality Group Inc.",
                "entity_group": r["org_node"].split("-")[0] if r["org_node"] else None,
                "reporting_line": "Commercial Risk Solutions",
                "industry": "Hospitality & Leisure",
                "sub_industry": "Airport Concessions",
                "team": pick(_TEAMS, 2),
                "office": _OFFICES.get(cc, "New York"),
                "ack_date": r["date_reported_to_aon"],
                "prep": "Not engaged" if seed[3] % 3 else "Engaged",
                "routing": pick(_ROUTING, 4),
                "name_of_loss": f"{r['cause_of_loss'] or 'Incident'} - "
                                f"{r['loss_city'] or 'Unknown'}",
                "catastrophe": "None" if seed[5] % 8 else "CAT-2026-01",
                "claims_made": r["date_reported_to_aon"],
                "first_aware": r["date_of_loss"],
                "prescription": None,
                "closure": closure_date,
                "last_updated": r["date_reported_to_aon"],
                "region": _REGIONS.get(cc, "North America"),
                "alt_region": _ALT_REGIONS.get(cc, "Americas"),
                "country": cc,
                "loss_region": _REGIONS.get(cc, "North America"),
            },
        )
    return len(rows)


def backfill_coordinates() -> int:
    """
    Populates loss coordinates on claims that predate the column.

    Keeps an existing local database usable after the schema change instead of
    requiring it to be deleted and reseeded.
    """
    from .db import query

    rows = query(
        "SELECT aon_claim_id, org_node, loss_country, loss_address FROM claims "
        "WHERE loss_latitude IS NULL"
    )
    for r in rows:
        geo = geocode_resolve(
            org_node=r["org_node"],
            address=r["loss_address"],
            country_code=r["loss_country"],
        )
        if not geo:
            continue
        execute(
            "UPDATE claims SET loss_latitude = :lat, loss_longitude = :lon "
            "WHERE aon_claim_id = :cid",
            {"lat": geo.latitude, "lon": geo.longitude, "cid": r["aon_claim_id"]},
        )
    return len(rows)


if __name__ == "__main__":
    import sys
    stats = seed(force="--force" in sys.argv)
    print("Seed complete:", json.dumps(stats, indent=2))
