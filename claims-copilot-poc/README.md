# Meridian Claims Copilot — Client Experience POC (Tier 1)

Proof of concept for the Aon RFP *Meridian Claims Copilot Client Experience Implementation*.

It exists to demonstrate three things running, not to be a product:

| Pillar | Proof | RFP anchor |
|---|---|---|
| **Pillar 3** — Micro-Frontend injection | The shell loads Claims from a remote at runtime; a crash inside it is contained | ADR-003, DR-3.1 → DR-3.8 |
| **Pillar 2** — Organisational scope | Same URL, same code, three personas, three different datasets — enforced server-side | BR-001, F-CC-07 |
| **Pillar 1** — Document provenance | Internal and carrier-only files never reach a client user | BR-007, BR-008, F-CC-09, ADR-001 |

Plus the strategic claim the RFP repeats five times — **configurable rather than bespoke** — evidenced by a field registry that drives the claims list at runtime (Exhibit 5, NFR-45).

---

## Run it

Three terminals. No Docker required.

```bash
# 1 — API  (seeds SQLite on first run)
cd services/claims-api
python -m venv .venv

# activate (macOS / Linux)
source .venv/bin/activate

# activate (Windows PowerShell)
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 2 — Shell + Micro-Frontend  (new terminal, repo root)
npm install
npm run dev

# 3 — Security evidence  (activate the same .venv first, then)
cd services/claims-api
python -m pytest -q
```

The `.venv` only needs creating once. Re-activate it (`source .venv/bin/activate` or `.venv\Scripts\Activate.ps1`) each time you open a new terminal for the API or tests.

| Surface | URL |
|---|---|
| Meridian shell (start here) | http://localhost:3000 |
| Claims MFE standalone harness | http://localhost:3001 |
| API docs | http://localhost:8000/docs |
| MFE remote entry | http://localhost:3001/remoteEntry.js |

Sign in as any of the seven personas from Exhibit 5. Start with **Persona 1 (C-Suite)**, then switch to **Persona 3 (Airport Director)** and **Persona 5 (Restaurant Manager)** to see scope narrow.

---

## Verified behaviour

Measured on this build, not aspirational:

```
BR-001 scope enforcement — same /api/v1/summary endpoint
  P1  C-Suite            CORP-HOSP             13 nodes   58 claims   $2,514,978
  P3  Airport Director   LOC-JFK                4 nodes   14 claims   $  515,372
  P5  Restaurant Mgr     SITE-JFK-T4-BISTRO     1 node     3 claims   $  162,992
  P7  Unauthorised       (no org_node)                    HTTP 403

Pillar 1 document filtering — CLM-0003
  Returned to client : 2   (Loss photographs.jpg, Repair invoice.pdf)
  Withheld by proxy  : 2   (internal adjuster note, carrier-only ACORD message)
  ECM reference leaked? no

BR-001 direct object access
  Bistro manager requesting CLM-0017 (SITE-LHR-T2-DELI) -> HTTP 403, audit row written

Test suite
  26 passed
```

---

## Real vs mocked — state this before any demo

| System | POC approach | Swap path |
|---|---|---|
| **Okta** | **Real** in `AUTH_MODE=okta`. Default `mock` issues a locally signed token so the POC runs with no tenant. | Set `AUTH_MODE=okta` + issuer/audience. Only `useAuth.ts` and `tokens.py` change. |
| **United UI** | `@poc/uui-stub` — identical export surface and prop shapes | `npm remove @poc/uui-stub && npm add @aon/united-ui`. No call sites change. |
| **Meridian shell** | Shell Simulator — a **real** Module Federation host, not a mock | Point `remotes` at Aon's shell |
| **Claims Copilot / Appian** | Python FastAPI over the Exhibit 5 data model | Replace the API base URL |
| **S-DMS / ECM FileNet** | Mock proxy enforcing audience + provenance server-side | Swap the transport in `sdms_proxy.py` |
| **MDM / Reltio** | Seeded 3-level hierarchy with materialised paths | Swap the resolver in `scope.py` |
| **MySQL** | SQLite (zero infra). Schema is portable; all queries use named parameters. | `DB_KIND=mysql` + `docker compose up`. Production target is InnoDB Cluster with Group Replication (NFR-17). |
| **Databricks** | Out of POC scope; the transactional/analytical boundary is documented | ACIA owns the analytics build |
| **Claude Code** | **Real** — mandatory under Meridian Pattern Layer 7 | None required |

Okta and Claude Code are the two used for real on purpose: they are the two non-negotiable adoption rules, so satisfying them in the POC rather than promising them matters.

---

## What is built vs deferred

**Built and working**

- Module Federation shell ↔ remote, React 18 singleton sharing, error-boundary containment
- Okta-shaped JWT with `org_node` and `groups` custom claims; JWKS path implemented
- Single-enforcement-point scope resolution (`app/auth/scope.py`) on every data route
- S-DMS proxy with audience, document-level attribute and provenance gates
- Landing page — five Figure 1 KPI tiles, entitlement-aware quick actions
- Claims list — Submitted/Drafts tabs, config-driven columns, PII masking, server-side paging
- Claim detail — Figure 4 financials band incl. SIR, timeline, document tab with withheld count
- FNOL wizard — five-step shell with Step 1 wired
- 26 negative security tests
- Locale switching incl. right-to-left Arabic

**Deliberately deferred to Tier 2** — say this out loud in a demo; declaring it reads as control

- FNOL Steps 2–5 with the DynamicFormEngine and all eleven product groups (configs for 5 are already in `config/fnol-forms/`)
- Resilient outbox submission (NFR-37) — schema table exists, worker does not
- Notification centre, admin config console, analytics placeholder
- Saved views, Excel/PDF export, location map
- Native iOS and Android applications

---

## Layout

```
claims-copilot-poc/
├── babel.config.js            # root config — .babelrc is package-scoped and would
│                              #   miss the symlinked @poc/* sources
├── packages/
│   ├── uui-stub/              # Meridian Pattern Layer 1 surrogate
│   ├── contracts/             # shared types incl. the shell↔MFE prop contract
│   ├── shell/                 # Module Federation HOST  (:3000)
│   └── claims-mfe/            # Module Federation REMOTE (:3001)  <- the deliverable
├── services/claims-api/       # Python service layer     (:8000)
│   ├── app/auth/scope.py      # <- BR-001. The single enforcement point.
│   ├── app/services/sdms_proxy.py  # <- Pillar 1 gates
│   └── tests/                 # negative security evidence
├── config/                    # hot-reloadable. NFR-45 proof lives here.
└── docs/adr/
```

---

## Where the rules actually live

Two files carry the architecture. Read these first in any review:

**`services/claims-api/app/auth/scope.py`** — BR-001 / F-CC-07. Assigned node plus all descendants, never peers, never parents. Two invariants:

1. Scope derives **only** from the validated token's `org_node` claim — never a query parameter, header or body, because those are client-controllable.
2. There is **exactly one** place that computes it. A second would be a bypass.

**`services/claims-api/app/services/sdms_proxy.py`** — Pillar 1 / ADR-001. Three sequential gates (audience → document attribute → provenance), and the ECM reference never leaves the service.

---

## Demo sequence

| # | Action | Point |
|---|---|---|
| 1 | Sign in as **P1 C-Suite** | 58 claims, $2.5M. Claims is a runtime-loaded MFE. |
| 2 | Switch to **P3 Airport Director** | 14 claims, $515K. Same URL, same code. |
| 3 | Switch to **P5 Restaurant Manager** | 3 claims. The peer site's claims were never returned, not hidden. |
| 4 | Open a claim → Documents | 2 of 4 shown. The banner names what the proxy withheld and why. |
| 5 | Paste an out-of-scope claim URL | 403 with an audit row — not 404, so existence does not leak either. |
| 6 | Edit `config/field-registry.json`, refresh | New column. No rebuild, no deploy (NFR-45). |
| 7 | Switch locale to Arabic | RTL layout from resource files, no code change (NFR-42, NFR-44). |
| 8 | `python -m pytest -q` | 26 tests. This is the Workstream 3 negative-testing evidence. |

---

## Known rough edges

Honest list — none are architectural:

- **Persona 6 returns 0 claims.** The own-claims-only filter is working correctly, but the seed assigns no submissions to Tom Beckett. One line in `app/seed.py` fixes it.
- **Year-on-year KPI deltas are fixed illustrative values.** The response shape matches Figure 1; a prior-period query is Tier 2.
- **Claims-list labels are derived from `label_token` by string transform.** Real i18n bundles exist at `packages/i18n/locales/` but are not yet wired into the MFE.
- **`document/{id}/content` returns a JSON stub** rather than streaming bytes. The access checks around it are real and tested.
- **SQLite, not MySQL.** Deliberate, so the POC runs with no infrastructure. The `mysql` path and compose file are present but unexercised.

---

## Traceability

| Artefact | RFP source |
|---|---|
| Five KPI tiles | Figure 1, Epic 1 |
| Submitted / Drafts tabs, column set | Figure 3, Epic 3 |
| Financials band with SIR | Figure 4 |
| Five-step wizard | Figure 5, Epic 2, Exhibit 4 |
| Field attribute model | Exhibit 5 |
| Seven personas, privilege groups | Exhibit 5 |
| Scope enforcement | BR-001, BR-002, BR-005, BR-006, F-CC-07 |
| Document gates | BR-003, BR-007, BR-008, ADR-001, F-CC-09 |
| MFE injection and containment | ADR-003, DR-3.1 → DR-3.8 |
| Payload limits, PII, audit, accessibility | NFR-04, NFR-05, NFR-34, NFR-41, NFR-45, NFR-48, NFR-49 |
