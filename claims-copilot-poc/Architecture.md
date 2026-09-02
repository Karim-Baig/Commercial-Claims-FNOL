# Claims Copilot POC — Architecture

**Last verified:** 2026-08-27 against commit working tree.
**How to re-verify the counts in this document:** see [§15 Keeping this document honest](#15-keeping-this-document-honest).

| Metric | Current |
|---|---|
| Database tables | 16 |
| API routers / endpoints | 12 / 45 |
| Field registry attributes | 73 (in `seed.py`, not `config/` — see §8.2) |
| Backend tests | 144 |
| Locales / translation keys | 5 / 494 |
| MFE screens | 7 |

---

## 1. System Overview

Meridian Claims Copilot is a proof of concept for Aon's client-facing claims
experience, built as a **Micro-Frontend** (Webpack 5 Module Federation) over a
**Python FastAPI** service.

The POC exists to prove four things are architecturally sound, not to be a complete
product:

| Capability | Where it is enforced | Evidence |
|---|---|---|
| Scoped claims visibility (BR-001) | `app/auth/scope.py` — one function | `test_scope_negative.py` |
| Document security gating | `app/services/sdms_proxy.py` — three gates | `test_document_rbac.py` |
| Config-driven UI (NFR-45) | `field_registry` table → runtime columns | `test_field_registry.py` |
| Resilient FNOL intake (NFR-37) | `fnol_outbox` written before Appian is called | `test_epic_features.py` |

> **Open item — pillar numbering.** The code, tests and i18n keys
> (`detail.pillar1_label`) all use "Pillar 1" for the **document gate**, whereas the
> overview prose used to imply scoped visibility was first. The prose has been
> reworded to name capabilities rather than number them, so the repo is now
> internally consistent — but the numbering has never been checked against the RFP's
> own wording. Do that before any client-facing deliverable reuses "Pillar N".

---

## 2. High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                             Browser                                       │
│                                                                           │
│  ┌──────────────────────────────┐      ┌──────────────────────────────┐   │
│  │  Meridian Shell (HOST)       │      │  Claims MFE (REMOTE)         │   │
│  │  :3000                       │      │  :3001  ← the deliverable    │   │
│  │                              │      │                              │   │
│  │  GlobalNav                   │      │  LandingScreen               │   │
│  │  PersonaPicker               │      │  ClaimsListScreen            │   │
│  │  MfeHost (React.lazy) ───────┼──────┼─►ClaimDetailScreen           │   │
│  │  MfeErrorBoundary            │      │  FnolWizard (5 steps)        │   │
│  │  shellEventBus       ◄───────┼──────┼──NotificationCentreScreen    │   │
│  │  locale + brand state        │      │  AnalyticsScreen             │   │
│  │                              │      │  AdminConfigScreen           │   │
│  └──────────────────────────────┘      └──────────────────────────────┘   │
│        ClaimsAppProps (typed)                    Bearer JWT               │
└───────────────────────┬───────────────────────────────┬───────────────────┘
                        │                               │
                        ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  Claims API — FastAPI  :8000                              │
│                                                                           │
│  auth   claims   config   fnol   messages   notifications   preferences   │
│  views  export   pins     map    analytics                                │
│                              │                                            │
│                              ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  scope.py — SINGLE ENFORCEMENT POINT (BR-001)                       │  │
│  │  JWT org_node → materialised path prefix query → authorised scope   │  │
│  │  No route may bypass the current_scope dependency.                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         │                    │                    │                       │
│         ▼                    ▼                    ▼                       │
│  ┌────────────┐   ┌──────────────────┐   ┌──────────────────┐             │
│  │ SQLite /   │   │ sdms_proxy.py    │   │ audit.py         │             │
│  │ MySQL      │   │ 3 document gates │   │ allow + deny log │             │
│  │ 16 tables  │   │ → ECM FileNet    │   │ (NFR-04)         │             │
│  └────────────┘   └──────────────────┘   └──────────────────┘             │
│                          │                                                │
│                          ▼  server-side egress only                       │
│                   map tile proxy · notify rules engine                     │
└───────────────────────────────────────────────────────────────────────────┘
```

Two egress rules shape the outbound edges: the browser never talks to a map vendor
(tiles are proxied so no subscription key or address reaches a third party), and
exports are rendered server-side so PII masking happens before data crosses the
trust boundary rather than being redacted cosmetically in the client.

---

## 3. Frontend Architecture

### 3.1 Module Federation split

| App | Role | Port | Entry |
|---|---|---|---|
| `shell` | MFE host — nav, auth, locale | 3000 | `packages/shell/src/App.tsx` |
| `claims-mfe` | MFE remote — the deliverable | 3001 | `packages/claims-mfe/src/ClaimsApp.tsx` |

Rationale and rejected alternatives: **ADR-POC-001**. In short — iframes fail
accessibility and shared-auth requirements; a build-time npm package breaks
independent deployability (DR-3.7); import maps were unjustified stack risk.

### 3.2 Shell → MFE contract

Typed in `packages/contracts/src/mfe.ts`. Props flow down only; the MFE talks back
via events.

```typescript
interface ClaimsAppProps {
  authToken: string;        // MFE never obtains its own token (DR-3.1)
  orgNode: string | null;   // display only — API re-derives scope from the JWT
  userGroups: string[];     // privileges, for UI gating only
  locale: string;
  userName?: string;
  claimId?: string | null;  // deep-link target recovered from PKCE state (DR-3.5)
  navRequest?: { route: "landing" | "list" | "analytics" | "fnol"; ts: number } | null;
  onEvent?: (event: ShellEvent) => void;   // DR-3.8
  apiBaseUrl?: string;
}
```

`navRequest` carries a timestamp so a shell nav click fires once rather than on
every re-render. Events back to the shell: `claims:navigated`, `claims:title`,
`claims:notification-count`, `claims:error`.

### 3.3 Routes within the MFE

Routing is internal to the remote (union-type state, no URL router).

| Route | Screen | Origin |
|---|---|---|
| `landing` | `LandingScreen` — customisable KPI band, recent claims, pins | Fig 1 / Epic 1 |
| `list` | `ClaimsListScreen` — filters, saved views, export, drafts tab | Fig 3 / Epic 3 |
| `detail` | `ClaimDetailScreen` — financials, map, documents, message thread | Fig 4 / Epic 3 |
| `fnol` | `FnolWizard` — 5 steps, config-driven, resumable | Fig 5 / Epic 5 |
| `notifications` | `NotificationCentreScreen` + preferences + delivery ledger | Epic 8 |
| `analytics` | `AnalyticsScreen` — presentation container + drill-down | Epic 4 |
| `admin` | `AdminConfigScreen` — field registry editor | NFR-45 |

`FnolPlaceholder.tsx` is the superseded Sprint-0 scaffold, still present but not
routed. It can be deleted once nothing references it.

### 3.4 Shared packages (npm workspaces)

| Package | Purpose |
|---|---|
| `@poc/contracts` | Shell↔MFE and API response types (`auth`, `claim`, `document`, `f9`, `field-registry`, `mfe`) |
| `@poc/i18n` | `I18nProvider`, `useI18n`, `createTranslator` — 5 locales, RTL-aware |
| `@poc/uui-stub` | Surrogate for `@aon/united-ui`, identical export surface |

`uui-stub` components: `Button`, `GatedAction`, `TextField`, `Select`, `DatePicker`,
`Checkbox`, `Breadcrumb`, `Card`, `PageHeader`, `Tabs`, `DataTable`, `KpiTile`,
`StatusPill`, `Timeline`, `Badge`, `LocationMap`, `Modal`, `Banner`, `Spinner`,
`EmptyState`, `Toast`, `Stepper`, `FileUpload`, `FormField`.

**`GatedAction` vs `disabled`.** Entitlement gates use `GatedAction`, which keeps the
control focusable and binds a visible reason via `aria-describedby`. A natively
disabled button is skipped by Tab, so assistive technology never announces why the
action is unavailable — which would fail NFR-41/NFR-48. Plain `disabled` is reserved
for transient form state.

### 3.5 Accessibility decisions worth not regressing

- KPI reordering uses explicit ↑/↓ buttons, not drag-and-drop. WCAG 2.2 SC 2.5.7
  requires a single-pointer alternative to dragging, so the buttons are the
  primitive rather than a fallback. Moves are announced through a live region.
- Colour tokens: `teal600` is 4.5:1 on white and is for accents; **`teal700` is the
  text-safe teal** (6.9:1 on white, 6.1:1 on `teal050`). Do not put small text in
  `teal600` on a tint.

---

## 4. Backend Architecture

```
services/claims-api/app/
├── main.py            # app factory, CORS, router registration, startup seed/migrate
├── schema.py          # DDL for 16 tables + additive migration list
├── seed.py            # demo data + backfills (coordinates, Exhibit 5 fields)
├── db.py              # SQLite/MySQL abstraction (DB_KIND), expand_in helper
├── settings.py
├── auth/
│   ├── tokens.py      # HS256 mock issue/verify · RS256 Okta verify
│   └── scope.py       # BR-001 single enforcement point
├── routers/           # 13 routers — see §6
└── services/
    ├── audit.py       # allow + deny trail (NFR-04)
    ├── sdms_proxy.py  # document gates + claim-in-scope resolver
    ├── geocode.py     # org-node → coordinates (seeded, no vendor call)
    └── notify.py      # notification rule catalogue + evaluation (Epic 8)
```

### 4.1 Request lifecycle

```
HTTP request
  → CORS middleware
  → tokens.current_principal   validate Bearer JWT, extract sub/org_node/groups
  → scope.current_scope        resolve authorised org_node list, or 403 + audit row
  → route handler              SQL filtered by `org_node IN (:scope)`
                               privilege checks via sp.has(...)
                               document gates for document routes
  → response
```

### 4.2 Auth modes

| Mode | Issuance | Validation |
|---|---|---|
| `mock` (default) | `POST /auth/mock-token`, HS256, `sub = "poc|persona-N"` | `MOCK_JWT_SECRET` |
| `okta` | Okta PKCE in the browser | RS256 against Okta JWKS |

Only `app/auth/tokens.py` and `packages/shell/src/auth/useAuth.ts` change for the
production swap.

> The mock `sub` format matters: anything storing rows against a user (notifications,
> preferences, drafts, pins, saved views) must key on `poc|persona-N`, not the
> persona display name. Seeding notifications against the display name once made the
> notification centre silently return zero rows for every persona.

---

## 5. Security Architecture

### 5.1 BR-001 — single scope enforcement point

The central invariant. `app/auth/scope.py`, one function, mandatory dependency.

1. `org_node` comes **only** from the validated JWT — never a query param, header or
   body field.
2. `current_scope` is applied to every data route. A second scope computation
   anywhere would be a bypass.
3. Out-of-scope access returns **403, not 404** — existence is not confirmed.
4. Denials write an `audit_log` row.

```sql
SELECT org_node FROM org_nodes WHERE path LIKE '/CORP-HOSP/LOC-JFK/%'
```

The trailing separator is load-bearing: without it `/LOC-JFK/` would prefix-match a
sibling named `/LOC-JFKX/`.

### 5.2 Document gate — three sequential filters

All in `sdms_proxy.py`, applied before any response is built.

| Gate | Rule | Ref |
|---|---|---|
| Audience | only `audience = 'client_visible'` passes | F-CC-09 |
| Security attribute | exclude `security_attr = 'internal'` even if audience allows | NFR-05 |
| Provenance | exclude `provenance = 'client_provided_via_claims'` in broker contexts | BR-008 |

`ecm_reference` never appears in any response. The withheld **count** is returned so
the UI can state that a record is partial rather than implying it is complete.

### 5.3 The same pattern, reused

Three later features re-apply the document gate's shape rather than inventing new
models — worth preserving:

- **Message threads.** Aon-internal notes share `claim_messages` with client
  correspondence and are filtered server-side, with a withheld count. `author_role`
  and `audience` are derived from the caller, never the payload, so a client cannot
  forge an Aon reply or post a message hidden from Aon.
- **Exports.** Rendered server-side precisely because masking must happen inside the
  trust boundary.
- **Pins.** A pin points at a *record*, so it is re-authorised on every read: stored
  `org_node` is re-checked against live JWT scope, and the restricted-access flag and
  own-only privilege are re-evaluated. A pin taken while a user held a privilege
  stops resolving when the privilege is removed.

### 5.4 Privilege model

Ten strings in the JWT `groups` claim: `claims_viewer`, `claims_fnol`, `claims_docs`,
`claims_upload_docs`, `claims_analytics`, `claims_export`, `claims_view_pii`,
`claims_view_restricted`, `claims_client_admin`, `claims_own_only`.

UI gating is presentation only — every rule is enforced independently server-side.

### 5.5 Audit log (NFR-04)

`actor_sub`, `action`, `resource_type`, `resource_id`, `org_node`, `outcome`
(`allowed` / `denied`), `ts`. Both outcomes are recorded.

---

## 6. API Surface

All data routes require a Bearer JWT and apply `current_scope`. Base: `/api/v1`.

| Router | Endpoints |
|---|---|
| `auth_routes` | `GET /auth/personas` · `POST /auth/mock-token` *(both unauthenticated)* |
| `claims_routes` | `GET /summary` · `/claims` · `/claims/{id}` · `/claims/{id}/documents` · `/documents/{id}/content` · `/claims-filter-options` · `/hierarchy` |
| `config_routes` | `GET /config/field-registry` · `POST /config/field-registry/{key}` *(client admin)* · `GET /config/branding` · `GET /config/countries/{cc}` |
| `fnol_routes` | `GET /policies` · `POST /fnol` · `GET /fnol/outbox` · draft CRUD `GET/PUT/DELETE /fnol/drafts[/{id}]` · `GET /fnol/delegates` · `POST/DELETE /fnol/drafts/{id}/delegate` |
| `message_routes` | `GET`/`POST /claims/{id}/messages` |
| `notification_routes` | `GET /notifications` · `GET /notifications/deliveries` · `PATCH /notifications/{id}/read` · `PATCH /notifications/read-all` |
| `preference_routes` | `GET`/`PUT`/`DELETE /preferences` — KPI layout **and** notification rules |
| `views_routes` | `GET`/`POST /views` · `PATCH`/`DELETE /views/{id}` |
| `export_routes` | `GET /export/claims.xlsx` · `GET /export/claims.pdf` |
| `pin_routes` | `GET /pins` · `PUT`/`DELETE /claims/{id}/pin` |
| `map_routes` | `GET /map/config` · `GET /map/tile/{z}/{x}/{y}` |
| `analytics_routes` | `GET /analytics/dimensions` · `GET /analytics/aggregate` |
| *(app)* | `GET /health` · `GET /` |

**Notification mark-read is `PATCH`, not `POST`.** Calling it with POST 405s; a
swallowed rejection once made this look like a silent no-op.

---

## 7. Data Architecture

16 tables. SQLite for development (zero infra, auto-seeded), MySQL 8.0 InnoDB as the
production target.

| Table | Purpose |
|---|---|
| `clients` | Tenant registry — 2 demo clients. The tenant boundary asserted alongside BR-001 |
| `org_nodes` | Hierarchy with materialised paths — the scope substrate |
| `personas` | 10 demo personas — the 7 Exhibit 5 personas plus 3 for the second client |
| `field_registry` | 73 claim attributes with visibility flags (NFR-45) |
| `policies` | Policies per org node, `active_for_fnol` drives FNOL step 2 |
| `claims` | 80 demo claims (60 + 20 across two clients), ~80 columns incl. the Exhibit 5 core model |
| `documents` | `audience` / `security_attr` / `provenance` / `ecm_reference` |
| `fnol_outbox` | Durable intake queue with `idempotency_key` (NFR-37) |
| `fnol_drafts` | In-progress wizard state, owner-scoped (cross-device resume) |
| `claim_messages` | Adjuster threads, `audience`-filtered |
| `notifications` | Per-recipient inbox, keyed on token `sub` |
| `notification_deliveries` | Rule-evaluation ledger (what *would* have been sent) |
| `user_preferences` | KPI layout + notification rules, per `user_sub` |
| `saved_views` | Named filter sets, optionally shared down the hierarchy |
| `claim_pins` | Pinned claims, re-authorised on read |
| `audit_log` | Allow + deny trail |

### 7.1 Schema evolution

`schema.py` uses `CREATE TABLE IF NOT EXISTS`, which does **not** alter an existing
table. Columns added after first ship must be listed in `ADDITIVE_COLUMNS` and are
applied by `migrate()` at startup. Additive only — nothing drops or rewrites data.

### 7.2 Why drafts are not rows in `claims`

A half-finished intake has no status, product or date of loss, all `NOT NULL` on
`claims`. Storing drafts there would mean writing placeholder values and then needing
a way to tell placeholders from real claims. `fnol_drafts` holds the wizard state as
JSON, which also decouples the draft shape from `config/fnol-forms/*` — adding a form
field never migrates the table.

Drafts are **private to their author**, not shared across an org node: two managers at
one site should not see each other's unfinished work. Non-owner access returns 404,
since there is nothing the caller could act on either way.

---

## 8. Config-Driven Behaviour (NFR-45)

### 8.1 What is genuinely runtime-configurable

| File | Drives | Mechanism |
|---|---|---|
| `branding.json` | Epic 6 branding + timezone, layered default → client → country | read from `CONFIG_DIR` per request |
| `maps.json` | Map provider, zoom, residency rules | read from `CONFIG_DIR` per request |
| `countries/*.json` | US, AE country config | read from `CONFIG_DIR` per request |
| `field_registry` **table** | 73 claim attributes: list/record/analytics visibility, PII flag, order, type | served by `GET /config/field-registry`; editable via `POST /config/field-registry/{key}` (Admin console) with no rebuild or redeploy |

The claims list has **no hard-coded column array and no literal column caption**.
Columns come from the registry; captions come from each row's `label_token` resolved
against the active locale. "Columns to Show" layers a per-session preference on top
without mutating the registry. This part of NFR-45 is real and demonstrable through
the Admin console.

### 8.2 Config files that are currently documentation only ⚠

Three paths under `config/` are **not read by any code**. Verified 2026-08-22 —
grep for the filename outside `dist/` returns only docs and one translation string.

| Path | Believed source | Actual source |
|---|---|---|
| `config/field-registry.json` | 73 attributes, re-seed to apply | 9 stale entries, unread. Real source is the `FIELDS` list in `seed.py` (73 rows) |
| `config/privileges.json` | Persona → privilege map | Unread. Real source is the `PERSONAS` list in `seed.py` |
| `config/fnol-forms/*.json` | 12 product form schemas | Unread. Real source is hand-written objects in `packages/claims-mfe/src/fnol-config-loader.ts` |

**Why this matters beyond tidiness:** the demo script in `README.md` step 6 and the
in-product banner string `list.config_banner_body` (all five locales) both instruct
the user to *"edit `config/field-registry.json` and refresh"*. That action currently
has no effect, so following the script in front of a client would show nothing
changing. `CONFIG_DIR` is only consulted for `branding.json`, `maps.json` and
`countries/`.

Either the loaders should be wired up, or the instructions and the vestigial files
should go and the message should point at the Admin console instead. That is a scope
decision, not a documentation one — flagged rather than silently changed.

### 8.3 Adding a dashboard KPI

Self-describing by design: each KPI in `GET /summary` carries `unit`
(`money`/`count`/`percent`/`days`) and `rise_is_adverse`, so the dashboard formats and
colours a tile it has no specific knowledge of. To add one:

1. Add the value in `claims_routes.summary()`.
2. Add the key to `KNOWN_KPIS` in `preference_routes.py`.
3. Add a `kpi.<key>` translation to all five locales.

No frontend change. Two tests enforce this contract: every `KNOWN_KPIS` entry must
appear in `/summary`, and every one must have a translation.

**New tiles ship hidden.** `_normalise` appends an unrecognised-but-known key to a
stored layout and leaves it hidden, so a tile never switches itself on across every
saved dashboard the day it ships. 5 of 17 are visible by default.

---

## 9. Internationalisation

494 keys × 5 locales in `packages/i18n/locales/`: `en-US` (default), `es-ES`,
`fr-FR`, `de-DE`, `ar-AE` (RTL).

Locale state lives in the shell and is passed to the MFE as a prop; the remote carries
its own bundle copy rather than sharing a translation runtime across the federation
boundary, which keeps DR-3.7 intact. `dir` and `lang` are set on `<html>`.

Every user-visible string is a token. Layout uses logical properties
(`borderInlineStart`, `marginInlineStart`) so RTL mirrors correctly.

Timestamps render through `dateTimeInZone` with the zone from resolved branding, not
the reader's browser — on a multi-country programme two people reading one record
otherwise quote different wall-clock times at each other.

---

## 10. Demo Personas

| # | Name | Role | Org node | Privileges | Claims |
|---|---|---|---|---|---|
| 1 | Sarah Whitfield | C-Suite | CORP-HOSP | viewer, analytics, export, docs, view_pii, view_restricted | 58 |
| 2 | Daniel Osei | Risk Manager / Client Admin | CORP-HOSP | all of the above + upload_docs, fnol, client_admin | 58 |
| 3 | Priya Raman | Location Manager | LOC-JFK | viewer, fnol, docs, upload_docs, analytics | 14 |
| 4 | Marcus Lindqvist | Functional Lead | LOC-JFK | viewer, fnol | 14 |
| 5 | Maria Santos | Restaurant Manager | SITE-JFK-T4-BISTRO | viewer, fnol, docs, upload_docs | site only |
| 6 | Tom Beckett | Reporter | SITE-JFK-T4-BISTRO | fnol, own_only | own submissions only |
| 7 | Unassigned User | — | *(none)* | *(none)* | 403 everywhere |
| 8 | Eleanor Vance | C-Suite | CORP-RETAIL | viewer, analytics, export, docs, view_pii, view_restricted | 20 |
| 9 | Raj Bhatia | Regional Manager | LOC-NW-NORTH | viewer, fnol, docs, upload_docs, analytics | 10 |
| 10 | Fiona Clarke | Store Manager | SITE-NW-LEEDS | viewer, fnol, docs, upload_docs | 4 |

Personas 1 to 6 belong to client `CORP-HOSP`, personas 8 to 10 to `CORP-RETAIL`;
persona 7 belongs to neither. Personas 1 and 8 hold the same privileges at the same
level in different tenants, which is what makes them the pair to demonstrate the
tenant boundary with — see `test_cross_tenant.py`.

Persona 1 holds no `claims_fnol`, which is why the "Report a Claim" shortcut is
absent from their nav rather than shown disabled.

---

## 11. Testing Strategy

144 pytest tests, `TestClient` against an in-memory SQLite DB seeded once per session
with all 10 persona tokens pre-issued (`tests/conftest.py`).

| File | Tests | Covers |
|---|---|---|
| `test_cross_tenant.py` | 28 | Tenant (`client_id`) boundary, held separate from node scope. Role held constant while only the client varies, so a pass cannot be explained by a privilege difference |
| `test_scope_negative.py` | 15 | BR-001: peer/parent isolation, param + header override attempts, 403-not-404, audit on deny, own-only |
| `test_f9_features.py` | 34 | KPI layout defaults and normalisation, messaging + audience filter + forgery, draft ownership |
| `test_epic_features.py` | 25 | FNOL outbox and idempotency, notifications, branding, map residency |
| `test_export_and_views.py` | 23 | Export masking, saved-view sharing down the hierarchy |
| `test_sprint0_gate.py` | 8 | The four named Sprint 0 gates |
| `test_document_rbac.py` | 6 | Three document gates, `ecm_reference` absence, withheld count |
| `test_field_registry.py` | 5 | NFR-45 config-driven fields |

Tests are the evidence artefact for the security claims, not just a regression net —
`test_scope_negative.py` and `test_document_rbac.py` exist to be shown.

> Tests share one session-scoped database, so anything that writes user state must
> either use a persona no other test writes, or reset that state first. An
> order-dependent assertion here is a flake waiting to happen.

---

## 12. Known Gaps and Deliberate Omissions

Stated plainly so nobody mistakes an intentional boundary for an oversight.

| Area | State | Why |
|---|---|---|
| Email / SMS sending | Rules engine and delivery ledger only | Provider, sending domain, DKIM, consent register and jurisdiction are client decisions. A demo that appears to send and does not is worse than an honest gap. |
| Analytics content | Container + drill-down + stand-in aggregates | Epic 4 content is ACIA's delivery. Swap `_aggregate` for their source. |
| Map tiles | Schematic by default | Loss address is PII; no vendor is approved until the Privacy Impact Assessment names one. Residency overrides preference (NFR-12). |
| FNOL outbox worker | Table + write path, no reconciler | Receipt path is what the POC proves. |
| Draft attachments | Not persisted | A `File` handle cannot be serialised; re-uploading on resume is honest rather than implying we kept them. |
| YoY percentages | Illustrative constants | No historical dataset in the POC. Shape matches Figure 1. |
| Hierarchy source | Seeded paths | Reltio vs CCP is unresolved — **R-14**, see ADR-POC-002. |

---

## 13. External Integrations and Production Swap

| System | POC | Production |
|---|---|---|
| Okta | Mock HS256 default | `AUTH_MODE=okta` + `OKTA_ISSUER`, `OKTA_AUDIENCE`, `OKTA_CLIENT_ID` |
| MySQL 8.0 | SQLite | `DB_KIND=mysql` + env vars + `docker compose up` |
| `@aon/united-ui` | `@poc/uui-stub` | Swap the dependency; export surface is identical |
| Reltio MDM | Seeded materialised paths | Swap the resolver in `scope.py` |
| ECM FileNet (S-DMS) | Gates enforced, stub transport | Swap transport in `sdms_proxy.py`; gates unchanged |
| Claims Copilot (Appian) | Simulated 85% availability | Real HTTP client in `_try_claims_copilot` |
| Map vendor | Schematic renderer | Configure `maps.json`; tiles stay proxied |
| Databricks / ACIA | Out of scope | Separate build |

---

## 14. Development

```bash
# Terminal 1 — API
cd services/claims-api && python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — shell :3000 + MFE :3001
npm run dev

# Terminal 3 — tests
cd services/claims-api && python -m pytest -q
```

Shell `http://localhost:3000` · MFE standalone `http://localhost:3001` · OpenAPI
`http://localhost:8000/docs`.

**Note:** the API does not hot-reload new routers reliably when started without
`--reload`; after adding a router, restart it. Schema changes need `migrate()` (via
restart) and often a re-seed: `python -c "from app.seed import seed; seed(force=True)"`.

There is no working `npm run typecheck` — TypeScript is not installed and the build
strips types via Babel. Compile errors surface only from `npx webpack --mode
production`, so run that before claiming a frontend change builds.

---

## 15. Keeping this document honest

The header counts are mechanically checkable. Re-run these from the repo root and
update §1's table plus any section the change touches:

```bash
# tables — match the table name, not the phrase; a comment in schema.py also
# contains "CREATE TABLE IF NOT EXISTS", so a plain grep -c over-counts by one
grep -oE "CREATE TABLE IF NOT EXISTS [A-Za-z_]+" services/claims-api/app/schema.py \
  | sort -u | wc -l

# routers / endpoints
ls services/claims-api/app/routers/*_routes.py | wc -l
grep -rhoE '@router\.(get|post|put|patch|delete)\(' services/claims-api/app/routers/*.py | wc -l

# tests
(cd services/claims-api && python -m pytest --collect-only -q | grep "tests collected")

# field registry attributes — the DB is the source, seeded from seed.py FIELDS.
# Do NOT count config/field-registry.json: it is vestigial (§8.2).
python -c "import sqlite3;print(sqlite3.connect('services/claims-api/data/poc.sqlite3').execute('SELECT COUNT(*) FROM field_registry').fetchone()[0])"

# translation keys, and parity across locales
python -c "import json;print(len(json.load(open('packages/i18n/locales/en-US.json'))))"
```

Locale parity and unresolved token check (run from the repo root):

```bash
python - <<'PY'
import json, pathlib, re
loc = pathlib.Path('packages/i18n/locales')
en = json.loads((loc/'en-US.json').read_text(encoding='utf-8'))
keys = set()
for p in pathlib.Path('packages').rglob('*.ts*'):
    if 'dist' in p.parts: continue
    keys |= set(re.findall(r'\btr\(\s*["\']([a-z0-9_.]+)["\']', p.read_text(encoding='utf-8')))
print('referenced:', len(keys), 'missing from en-US:', sorted(keys - set(en)) or 'none')
for f in sorted(loc.glob('*.json')):
    d = json.loads(f.read_text(encoding='utf-8'))
    print(f.name, len(d), 'gap:', sorted(set(en) - set(d)) or 'none')
PY
```

Note this only catches literal `tr("...")` calls. Dynamic keys such as
``tr(`kpi.${key}`)`` are covered instead by the backend test
`test_every_known_kpi_has_a_translation`.

Maintenance expectations for changes are in `CLAUDE.md` §Architecture Documentation.

---

## 16. Architecture Decision Records

- **[ADR-POC-001](docs/adr/ADR-POC-001-module-federation.md)** — Webpack 5 Module
  Federation over iframes, build-time npm packages and import maps. Costs accepted:
  async bootstrap entry, pinned React singleton, contract package for cross-boundary
  type safety.
- **[ADR-POC-002](docs/adr/ADR-POC-002-org-scope-single-enforcement-point.md)** — One
  scope function, JWT-only derivation, 403 + audit on denial. Open question R-14:
  whether Reltio MDM or CCP entity groupings is authoritative.

Decisions taken since these ADRs and recorded only here or in code comments —
candidates for promotion to ADRs if they need to survive review:

| Decision | Where |
|---|---|
| Server-side export rendering to keep masking inside the trust boundary | §5.3 |
| Pins re-authorised per read rather than trusted | §5.3 |
| Shared saved views inherit BR-001 downward scope rather than a new sharing model | §6 |
| Self-describing KPIs; new tiles ship hidden | §8.1 |
| Drafts in their own table, private to their author | §7.2 |
| `GatedAction` over `disabled` for entitlement gates | §3.4 |
| Explicit move buttons over drag-and-drop (WCAG 2.2 SC 2.5.7) | §3.5 |
