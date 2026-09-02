# ADR-POC-002 — Organisational scope has exactly one enforcement point

**Status:** Accepted
**Date:** 21 August 2026
**Traceability:** BR-001, BR-002, BR-005, BR-006, F-CC-07, NFR-04

---

## Context

BR-001 is confirmed, not assumed: *a Client User's organisational scope is the assigned node plus all descendant nodes (downward inheritance). Peer and parent nodes are excluded.*

The RFP is explicit about why this matters. Direct client access raises the bar for data quality and privacy well above a colleague-only tool, and client organisation hierarchies must be mastered so that a user aligned to one subsidiary can never see claims belonging to a peer subsidiary or the parent entity.

Workstream 3 additionally requires **negative testing evidence** that no user can access claims, documents or analytics outside their authorised scope. That means the enforcement has to be provable, not merely present.

The failure mode we are guarding against is not a missing check. It is a *second* check — a helper that recomputes scope slightly differently, an endpoint added later that filters in the handler instead of the dependency, or a report query that joins around the boundary. Every one of those is a bypass, and each is individually plausible in a codebase touched by a distributed team over six months.

---

## Decision

**One function computes organisational scope. Every data route depends on it. Nothing else derives scope.**

`services/claims-api/app/auth/scope.py`:

```python
def resolve_authorized_scope(org_node: str | None) -> list[str]:
    """Returns the node itself plus every descendant, or raises 403."""
```

Three supporting rules:

1. **Scope derives only from the validated token's `org_node` claim.** Never from a query parameter, header or request body. Those are client-controllable and therefore worthless as an authorisation input.

2. **`current_scope` is a FastAPI dependency applied to every data route.** A route without it returns no data, because there is no other code path that produces a claims query.

3. **Denials are audited (NFR-04)** and return **403, not 404**, so a response cannot be used to infer whether a claim exists outside the caller's scope.

Hierarchy membership is resolved by materialised path with a trailing separator:

```
CORP-HOSP           /CORP-HOSP/
LOC-JFK             /CORP-HOSP/LOC-JFK/
SITE-JFK-T4-BISTRO  /CORP-HOSP/LOC-JFK/SITE-JFK-T4-BISTRO/
```

Scope for `LOC-JFK` is `path LIKE '/CORP-HOSP/LOC-JFK/%'`. The trailing separator is load-bearing: without it, `LOC-JFK` would match a sibling named `LOC-JFK2`.

---

## Consequences

**Good**

- One file to review, and one file to re-verify after any change.
- The invariant is mechanically testable. `test_org_node_query_param_cannot_override_jwt` and `test_org_node_header_cannot_override_jwt` fail loudly the moment someone accepts scope from the request.
- Prefix matching resolves an arbitrary-depth hierarchy in a single indexed query, so it satisfies the RFP requirement that the model not assume a fixed number of levels.
- Aggregates and lists cannot diverge, because both are built from the same scope list. `test_summary_claim_count_matches_list_total` asserts this.

**Costs and limits**

- Materialised paths must be rewritten if a node is re-parented. Acceptable here; a production implementation needs a maintained rebuild path, and MDM re-parenting frequency is an input to open item **R-14**.
- The whole descendant list is materialised in memory. Fine at POC scale and at the RFP's stated phase-1 volume of 1,000 users (NFR-28); a very wide hierarchy would want a correlated subquery instead.
- This ADR covers organisational scope only. Document provenance is a separate concern with its own gates — see `sdms_proxy.py`.

---

## Open item this interacts with

The RFP contains two statements that imply different sources of truth for the hierarchy:

- *Client Organisation Hierarchy and Scope Rule*: the model should work **without dependency on an external MDM hierarchy**.
- *Architecture Decisions (already taken)*: the solution **shall leverage MDM as the foundational source** for hierarchies used in scope and access-control decisions.

The POC implements a local hierarchy table, which satisfies either reading and keeps `resolve_authorized_scope` as the swap point. Which statement is authoritative determines whether that function reads MDM at query time or application-managed entity groupings in CCP, and it interacts with **R-14** — the MDM to Okta scope binding mechanism and refresh frequency, which the RFP notes determines entitlement latency and the joiner/mover/leaver revocation window.

This is raised as a clarification question rather than resolved unilaterally.
