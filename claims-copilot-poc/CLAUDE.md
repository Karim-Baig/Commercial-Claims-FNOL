# Claims Copilot POC — Claude Code Instructions

## Project Overview

Meridian Claims Copilot is a Proof-of-Concept for AON's insurance claims management platform. It is a **Micro-Frontend (Webpack 5 Module Federation)** application with a **Python FastAPI** backend. The POC validates four capabilities: scoped claims visibility, document security gating, config-driven UI, and resilient FNOL intake.

**[Architecture.md](Architecture.md) is the design-of-record.** Read it before making
structural changes, and update it as part of the change — see
[§Architecture Documentation](#architecture-documentation) below.

---

## Architecture Documentation

`Architecture.md` is not a write-once document. It drifted badly once already (it
described 8 tables when there were 15, and 3 routers when there were 12), and stale
architecture docs are worse than none because they get trusted.

### Update it in the same change, not afterwards

When your change touches any of the following, update the named section **before
reporting the work complete**:

| You changed | Update |
|---|---|
| Added/removed a table or column | §7 Data Architecture, and `ADDITIVE_COLUMNS` in `schema.py` |
| Added/removed a router or endpoint | §6 API Surface |
| Added/removed an MFE screen or route | §3.3 Routes within the MFE |
| Added a `uui-stub` component | §3.4 Shared packages |
| Changed a security rule, gate or privilege | §5 Security Architecture |
| Changed what `config/` drives | §8 Config-Driven Behaviour |
| Added a KPI tile | §8.3 (and the three-step recipe there) |
| Added/removed tests | §11 Testing Strategy table |
| Hit a deliberate boundary or left something unbuilt | §12 Known Gaps — say so explicitly |
| Made a decision worth defending later | §16 decision table, or a new ADR in `docs/adr/` |

Also refresh the **metric table and `Last verified` date** in the header. The commands
to regenerate every count are in §15 — run them, do not estimate.

### Rules for the content

- **Record the "why", not the "what".** The code says what it does. The document
  exists for the reasoning that is not recoverable from the code — why drafts are not
  rows in `claims`, why exports render server-side, why reordering uses buttons and
  not drag-and-drop.
- **Never document an aspiration as a fact.** If a config file is not actually read,
  say so (§8.2 is the precedent). If something is stubbed, put it in §12.
- **Flag, do not silently fix, discrepancies you find while documenting.** Writing a
  section is a good way to discover that reality disagrees with the docs; surface it
  and let the user decide scope.
- Verify claims before writing them. A grep or a curl is cheap.

---

## Monorepo Structure

```
claims-copilot-poc/
├── config/                  # Hot-reloadable runtime JSON config (no rebuild needed)
├── docs/adr/                # Architecture Decision Records
├── packages/
│   ├── contracts/           # Shared TypeScript types (shell ↔ MFE contract)
│   ├── i18n/                # Internationalisation (5 locales, RTL-aware)
│   ├── uui-stub/            # Design system stub (surrogate for @aon/united-ui)
│   ├── shell/               # Webpack MFE HOST — port 3000
│   └── claims-mfe/          # Webpack MFE REMOTE — port 3001 (the deliverable)
└── services/claims-api/     # Python FastAPI backend — port 8000
```

---

## Folder Directory

| Path | Contents |
|---|---|
| `config/branding.json` | Epic 6 branding + timezone, layered default → client → country. **Read at runtime.** |
| `config/maps.json` | Map provider, zoom, residency rules. **Read at runtime.** |
| `config/countries/` | Country-specific config (US, AE). **Read at runtime.** |
| `config/field-registry.json` | ⚠ Vestigial — not read by any code. Real source is `FIELDS` in `seed.py` (73 rows). See Architecture.md §8.2 |
| `config/privileges.json` | ⚠ Vestigial — not read. Real source is `PERSONAS` in `seed.py` |
| `config/fnol-forms/` | ⚠ Vestigial — not read. Real source is `packages/claims-mfe/src/fnol-config-loader.ts` |
| `packages/contracts/src/` | Shared types: `auth.ts`, `claim.ts`, `document.ts`, `f9.ts`, `field-registry.ts`, `mfe.ts` |
| `packages/shell/src/auth/` | JWT decode, mock auth hook, Okta PKCE path |
| `packages/shell/src/mfe/` | Module Federation host loader, error boundary, event bus |
| `packages/claims-mfe/src/screens/` | 7 screens: landing, claims-list, claim-detail, fnol, notifications, analytics, admin |
| `packages/claims-mfe/src/api/` | Fetch wrapper (`get/post/put/patch/del`), `useResource` hook, `ApiProvider` |
| `services/claims-api/app/auth/` | JWT issue/validate (`tokens.py`), scope enforcement (`scope.py`) |
| `services/claims-api/app/routers/` | 12 routers — see Architecture.md §6 for the full endpoint map |
| `services/claims-api/app/services/` | `audit.py`, `sdms_proxy.py`, `geocode.py`, `notify.py` |
| `services/claims-api/app/schema.py` | 15 table definitions + `ADDITIVE_COLUMNS` migration list |
| `services/claims-api/app/seed.py` | Demo data: 2 clients, 10 personas, 19 org nodes, 80 claims, 73 registry fields |
| `services/claims-api/tests/` | 144 pytest tests across 8 files |

---

## Development Setup

**Three terminals, no Docker required:**

```bash
# Terminal 1 — Backend API (port 8000)
cd services/claims-api
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend (shell :3000 + MFE :3001 concurrently)
npm install
npm run dev

# Terminal 3 — Tests
cd services/claims-api
python -m pytest -q
```

**Surfaces:**
- Shell: `http://localhost:3000`
- MFE standalone: `http://localhost:3001`
- API Swagger UI: `http://localhost:8000/docs`

**Verifying a frontend change:** there is no working `npm run typecheck` — TypeScript
is not installed and the build strips types via Babel, so type errors are invisible
until runtime. The only real check is a production build:

```bash
(cd packages/claims-mfe && npx webpack --mode production --output-path /tmp/build-check)
(cd packages/shell      && npx webpack --mode production --output-path /tmp/build-check)
```

Run it before claiming a frontend change works. Note this proves it *compiles*, not
that it *renders* — say which one you verified.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3.13 |
| Web framework | FastAPI 0.115.6 + Uvicorn |
| Data validation | Pydantic 2.10.4 |
| Auth | PyJWT 2.10.1 (HS256 mock / RS256 Okta) |
| Database (dev) | SQLite (auto-seeded, zero-infra) |
| Database (prod) | MySQL 8.0 (InnoDB Cluster) |
| Frontend language | TypeScript |
| UI framework | React 18 |
| MFE architecture | Webpack 5 Module Federation |
| Design system | `@poc/uui-stub` (swap to `@aon/united-ui` for prod) |
| i18n | Custom `@poc/i18n` (5 locales, RTL-aware) |
| Monorepo | npm workspaces |
| Node version | >=20 |

---

## Critical Security Rules — Do Not Break

### BR-001: Single Scope Enforcement Point
- **Never** read `org_node` from query params, request headers, or body in any data route.
- `org_node` is always derived exclusively from the validated JWT in `app/auth/scope.py`.
- The `current_scope` FastAPI dependency **must** be applied to every data route.
- Out-of-scope access returns **403** (not 404) and writes a denied row to `audit_log`.

### Pillar 1: Document Gate (three sequential gates)
All logic lives in `app/services/sdms_proxy.py`:
1. **Audience gate** (F-CC-09): only `audience = 'client_visible'` passes.
2. **Security attribute gate** (NFR-05): exclude `security_attr = 'internal'`.
3. **Provenance gate** (BR-008): exclude `provenance = 'client_provided_via_claims'` for broker contexts.
- `ecm_reference` must **never** appear in any API response.

### Auth modes
- `AUTH_MODE=mock` — API issues locally signed HS256 JWTs via `POST /api/v1/auth/mock-token`.
- `AUTH_MODE=okta` — API validates RS256 tokens against Okta JWKS. Only `tokens.py` and `useAuth.ts` change.

---

## Shell ↔ MFE Contract

The shell passes a typed `ClaimsAppProps` object to the MFE (never the other way):

```typescript
// packages/contracts/src/mfe.ts
authToken: string        // JWT — MFE never fetches its own token
orgNode: string | null   // display only; API re-derives from JWT
userGroups: string[]     // privilege list for UI gating
locale: string           // active locale
userName?: string        // display name, for the dashboard greeting
claimId?: string | null  // deep-link target (DR-3.5)
navRequest?: { route: "landing" | "list" | "analytics" | "fnol"; ts: number } | null
onEvent?: (event: ShellEvent) => void
apiBaseUrl?: string
```

`navRequest` carries a `ts` so a shell nav click fires once rather than on every
re-render.

The MFE emits typed events back via `onEvent`:
- `claims:navigated` — current route
- `claims:title` — browser tab title
- `claims:notification-count` — nav bell badge
- `claims:error` — error message

---

## API Routes Summary

All data routes require a Bearer JWT and apply `current_scope`.

45 endpoints across 12 routers. Full map in **Architecture.md §6**. The ones you will
touch most:

| Route | Description |
|---|---|
| `POST /api/v1/auth/mock-token` | Issue mock HS256 JWT (no auth) |
| `GET /api/v1/summary` | KPI aggregates (17 self-describing tiles) + recent claims |
| `GET /api/v1/claims` | Paginated, filterable claims list |
| `GET /api/v1/claims/{id}` | Claim detail + timeline |
| `GET /api/v1/claims/{id}/documents` | Documents, after the three gates |
| `GET`/`POST /api/v1/claims/{id}/messages` | Adjuster thread, audience-filtered |
| `GET`/`PUT`/`DELETE /api/v1/preferences` | KPI layout + notification rules, per user |
| `GET`/`PUT`/`DELETE /api/v1/fnol/drafts[/{id}]` | Cross-device draft continuity |
| `GET /api/v1/config/field-registry` | Exhibit 5 attribute model (from the DB) |
| `GET /health` | Service health check |

Gotchas that have bitten before:
- Notification mark-read is **`PATCH`**, not `POST`.
- The API does not pick up a **new router** without a restart.
- Mock JWT `sub` is `poc|persona-N`, **not** the persona display name. Anything
  storing per-user rows must key on the `sub`.

---

## Config-Driven UI (NFR-45)

Claims list columns are built at runtime from `GET /api/v1/config/field-registry`,
which is served from the `field_registry` **table**. To change visible columns
without a rebuild:

1. Use the Admin console (Configuration Console → toggles), which calls
   `POST /api/v1/config/field-registry/{field_key}`; **or**
2. Edit the `FIELDS` list in `services/claims-api/app/seed.py` and re-seed:
   `python -c "from app.seed import seed; seed(force=True)"`.

⚠ Editing `config/field-registry.json` does **nothing** — the file is not read. See
Architecture.md §8.2 for the full list of vestigial config paths and the demo-script
implications.

---

## Database

16 tables — see Architecture.md §7 for the annotated list.

`CREATE TABLE IF NOT EXISTS` does not alter an existing table, so any column added
after first ship must also go in `ADDITIVE_COLUMNS` in `schema.py`; `migrate()`
applies it at startup. Additive only.

Switch from SQLite to MySQL: set `DB_KIND=mysql` + MySQL env vars + `docker compose up`.

---

## Testing

Run: `cd services/claims-api && python -m pytest -q` (144 tests)

| File | Covers |
|---|---|
| `test_cross_tenant.py` | Tenant (`client_id`) boundary, role held constant so only the client varies |
| `test_scope_negative.py` | BR-001 — isolation, param/header override attempts, 403-not-404, audit on deny |
| `test_document_rbac.py` | The three document gates, `ecm_reference` absence, withheld count |
| `test_f9_features.py` | KPI layout, adjuster messaging + audience filter, draft ownership |
| `test_epic_features.py` | FNOL outbox/idempotency, notifications, branding, map residency |
| `test_export_and_views.py` | Export masking, saved-view sharing |
| `test_field_registry.py` | NFR-45 config-driven fields |
| `test_sprint0_gate.py` | The four named Sprint 0 gates |

Tests share **one session-scoped in-memory SQLite DB** with all 10 persona tokens
pre-issued (`conftest.py`). Anything writing per-user state must use a persona no
other test writes, or reset that state first — otherwise you create an
order-dependent flake.

`test_scope_negative.py` and `test_document_rbac.py` are the evidence artefacts for
the security claims, not just regression nets. Keep them readable.

---

## Environment Variables

Copy `.env.example` to `.env`:

```
AUTH_MODE=mock
MOCK_JWT_SECRET=poc-local-secret-do-not-use-in-any-real-environment
DB_KIND=sqlite
SQLITE_PATH=./data/poc.sqlite3
API_PORT=8000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
CONFIG_DIR=../../config
```

Frontend env vars (set in shell or CI, not .env):
- `MFE_URL` — where shell fetches `remoteEntry.js` (default: `http://localhost:3001`)
- `API_URL` — API base URL injected into `index.html` (default: `http://localhost:8000`)

---

## Production Swap Paths

| Component | POC | Production |
|---|---|---|
| Auth | Mock HS256 JWT | Okta PKCE RS256 (`AUTH_MODE=okta`) |
| Database | SQLite | MySQL 8.0 (`DB_KIND=mysql`) |
| Design system | `@poc/uui-stub` | `@aon/united-ui` |
| Hierarchy MDM | Seeded SQLite | Reltio (swap resolver in `scope.py`) |
| Document store | Mock proxy | ECM FileNet (swap transport in `sdms_proxy.py`) |

---

## Architecture Decision Records

- [ADR-POC-001](docs/adr/ADR-POC-001-module-federation.md) — Webpack 5 Module Federation chosen over iframes, npm packages, import maps.
- [ADR-POC-002](docs/adr/ADR-POC-002-org-scope-single-enforcement-point.md) — Single enforcement point for org scope; scope from JWT only; materialized paths prevent sibling leakage.
