# ADR-POC-005 — Tenancy is carried explicitly, not inferred from the hierarchy

**Status:** Accepted
**Date:** 22 August 2026
**Traceability:** BR-001 (p. 38), F-CC-07, Scale and Rollout Assumptions (p. 11), Application Profile — Data Classification "Confidential" (p. 42)
**Supersedes nothing. Extends:** ADR-POC-002 (single scope enforcement point)

---

## Context

The POC was built around the RFP's worked example: a single multi-site hospitality and airport concessions client, claim profile Airport → Location → Restaurant (pp. 39, 68). Production is roughly **100 clients across 10 countries in 2026**, scaling to the wider Commercial Risk book in 2027 (p. 11).

Before this decision, client isolation was **implicit**. It worked only because there was one client. Two tenants would have been separated purely because their materialised path prefixes differ — `/CORP-HOSP/` versus `/CORP-RETAIL/`.

That is a single point of failure protecting data classified **Confidential**, where `loss_address` and `named_insured` are additionally PII-flagged. The failure mode is cross-client disclosure, which is the worst outcome this system has and is not recoverable by apology.

---

## Decision

**Carry `client_id` explicitly on every tenant-scoped table, and filter on it in addition to the organisational node scope.**

Three parts:

**1. The hierarchy is authoritative for tenancy.** A node's tenant is resolved from `org_nodes.client_id`. The token may also assert `client_id`; if the two disagree the request is **refused**, not reconciled. A mismatch means the token and the hierarchy have diverged, and continuing would be guessing which is right.

**2. One helper returns both predicates.** `ScopedPrincipal.scope_clause()` returns `client_id = :tenant AND org_node IN (...)` as a single unit.

The earlier shape returned only the node list, which left it possible to apply one predicate and forget the other — and the one you would forget is the tenant, because the node filter is the visible part of the requirement. There is deliberately **no partial form of this helper to reach for**.

**3. Writes stamp the tenant from the resolved scope, never from the request body.** Every `INSERT` takes `sp.client_id`. A client cannot nominate the tenant its own row belongs to.

---

## The part that needed proving

The downstream tenant predicate is **redundant while the hierarchy is intact**, because `resolve_authorized_scope` already filters descendants by `client_id` — so `sp.scope` only ever contains same-tenant nodes.

That is precisely what defence in depth means, and precisely why it needs its own tests.

A mutation test made this concrete. With the downstream predicate disabled, the first 25 cross-tenant tests **all still passed** — they verified the outcome, not the mechanism. The second barrier was an untested claim.

Three tests were added that corrupt the first barrier deliberately:

| Test | Corruption simulated |
|---|---|
| `test_misstamped_claim_is_excluded_by_the_tenant_predicate` | Claim on tenant A's node, stamped to tenant B |
| `test_misstamped_claim_is_excluded_from_export` | The same row reaching a generated file |
| `test_misstamped_saved_view_is_excluded` | Shared view on an in-scope node, stamped to another tenant |

This is the realistic corruption: an MDM re-parent or a bad import leaves `org_node` and `client_id` disagreeing. Node scope alone would surface such a row.

Verified by mutation in both directions — disabling `scope_clause()` fails 2, disabling `tenant_clause()` fails 3, and the suite is green with both intact.

---

## Consequences

**Good**

- A hierarchy fault degrades to *wrong nodes within the right tenant* — recoverable — rather than *another client's claims*.
- Two barriers are independently verified rather than assumed.
- `client_id` gives Phase 3 layered configuration (per-client field registry, branding, FNOL forms) the key it needs.
- Composite indexes on `(client_id, org_node)` suit the two-predicate lookup.

**Costs**

- 13 tables carry a redundant-looking column. It is not redundant; it is the second barrier.
- Every new tenant-scoped table must remember it. `test_no_tenant_row_is_left_unassigned` catches a NULL, but a table added and never populated would pass by vacuous truth.
- Tenancy is assigned at startup by `assign_tenancy()`. Fine for a POC; production needs it enforced by `NOT NULL` once the backfill is historic.

**Deliberately not addressed**

- **Variable hierarchy depth.** `level` is still the three-value enum. That is Phase 2 — the second seeded tenant keeps the same depth on purpose so tenancy and hierarchy shape are not entangled.
- **Per-client configuration.** `field_registry` remains global. Phase 3.
- **Alternate hierarchies** (Exhibit 5, "Client Claim Profile"). Phase 2, and the largest piece of net-new work.
- **Internal Aon cross-client access.** A Claims Administrator legitimately works across clients. The RFP places this outside scope (p. 19: *"Pillar 2 covers Client User RBAC only"*), and it is a different access model.

---

## Open item this depends on

Phase 2 cannot be designed correctly until Aon resolves the hierarchy contradiction:

> **p. 35** — the model should work *"without dependency on an external master data management (MDM) hierarchy"*
> **p. 40** — the solution *"shall leverage MDM as the foundational source for client organizational hierarchies used in scope and access-control decisions"*

If MDM is authoritative, hierarchy is read-only and synced, needing conflict handling and a refresh cadence. If CCP entity groupings are authoritative, hierarchy is writable in-app, needing an admin surface and audit trail.

This decision is safe under either answer, which is why it was taken first.
