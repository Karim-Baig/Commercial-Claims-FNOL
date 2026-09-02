# ADR-POC-001 — Webpack Module Federation for Micro-Frontend injection

**Status:** Accepted
**Date:** 21 August 2026
**Traceability:** ADR-003, DR-3.1, DR-3.2, DR-3.3, DR-3.4, DR-3.5, DR-3.7, DR-3.8, NFR-37

---

## Context

ADR-003 is already taken by Aon and is not open for re-litigation: Claims Copilot is delivered as a Micro-Frontend injected into the Meridian ReactJS shell. A dedicated Claims Copilot portal was assessed and rejected; a Meridian-owned Claims UX was assessed as a viable secondary only.

What remains open is the *implementation mechanism*, and the RFP invites providers to comment on implementation approach. The design requirements constrain it substantially:

| Ref | Requirement |
|---|---|
| DR-3.1 / DR-3.5 | Authentication context and deep-link pass-through from shell to MFE, including prop-based Claim ID hand-off **at mount time** |
| DR-3.2 | Framework alignment to Meridian standards (React) |
| DR-3.3 | Consumption of the UUI design system |
| DR-3.4 | React Error Boundary containment so a Claims failure degrades gracefully without destabilising the shell |
| DR-3.7 | **Independent** Micro-Frontend deployment |
| DR-3.8 | Shell event interface |

---

## Options considered

**1. iframe embedding**

Strongest isolation, and a crash genuinely cannot touch the shell. Rejected because it cannot satisfy DR-3.1/DR-3.5 cleanly — prop-based hand-off at mount time becomes `postMessage` choreography — and it makes DR-3.3 near-impossible, since design tokens and focus management do not cross the frame boundary. Accessibility suffers badly, which matters when WCAG 2.2 AA is a Must (NFR-48).

**2. npm package consumed at shell build time**

Simplest integration and full type safety. Rejected on DR-3.7 alone: if Claims ships inside the shell bundle, every Claims release becomes a Meridian shell release. Given the RFP's compressed timeline and the goal of onboarding countries without re-engineering, coupling the release trains is the wrong trade.

**3. Webpack Module Federation — chosen**

The remote is loaded at runtime from its own `remoteEntry.js`. React is shared as a singleton so hooks and context work across the boundary. The MFE is a plain React component from the shell's perspective, so props, error boundaries and the design system all behave normally.

**4. Native Federation / import maps**

Bundler-agnostic and forward-looking. Rejected for this engagement because the RFP names React 18 and the existing Meridian shell is an established webpack build; introducing a second module system is unjustified risk for no requirement it uniquely satisfies.

---

## Decision

Webpack 5 Module Federation, with the shell as host and Claims as remote.

```js
// host
remotes: { claimsMfe: "claimsMfe@http://localhost:3001/remoteEntry.js" }
shared:  { react: { singleton: true }, "react-dom": { singleton: true } }

// remote
exposes: { "./ClaimsApp": "./src/ClaimsApp" }
```

The contract is a typed prop interface in `@poc/contracts` rather than a convention:

```tsx
<ClaimsApp
  authToken={accessToken}            // DR-3.1
  orgNode={claims.org_node}
  userGroups={claims.groups}
  locale={locale}
  claimId={deepLinkClaimId ?? null}  // DR-3.5 — prop at mount, not URL re-read
  onEvent={shellEventBus.emit}       // DR-3.8
/>
```

Wrapped in `MfeErrorBoundary` (DR-3.4), which renders a Claims-unavailable banner while leaving shell navigation fully usable.

---

## Consequences

**Good**

- DR-3.7 is satisfied structurally, not by process discipline. Claims deploys on its own cadence; the shell picks up the new remote on next load.
- The MFE obtains no token of its own and reads no shell globals. Everything arrives as props, which makes the boundary auditable and the remote testable in isolation — the standalone harness at `:3001` exists because of this.
- The deep-link path satisfies the hard part of the requirement: the link survives authentication. The intended path is carried in the PKCE `state` parameter (F-MER-04), recovered after redirect, and passed as `claimId` at mount, so the user lands on the record rather than a generic home page.
- React singleton sharing means UUI components, context and hooks behave identically inside and outside the remote, which is what makes DR-3.3 tractable.

**Costs**

- **The entry point needs an async boundary.** Shared singletons are initialised asynchronously by the federation runtime, so an entry chunk that imports `react` or `react-dom` statically fails at load with *"Shared module is not available for eager consumption"* — and it fails silently as a blank page, because it throws before any component mounts. Both `index.tsx` files therefore contain nothing but `import("./bootstrap")`, with the real entry in `bootstrap.tsx`. This bit us during the Tier 1 build and cost a debugging cycle; it is a permanent constraint of the pattern, not a one-off. The alternative — `eager: true` on the shared deps — would bundle React into both host and remote and defeat the singleton, so it was rejected.

- **Shared-dependency version discipline.** A React major mismatch between shell and remote is a runtime failure, not a build failure. `requiredVersion` is pinned on both sides; production needs this enforced in CI.
- **The remote is a runtime dependency.** If `remoteEntry.js` is unreachable, Claims does not load. This is precisely why DR-3.4 containment is mandatory rather than optional, and it is worth noting the failure is confined to the Claims panel — consistent with NFR-37's graceful-degradation requirement.
- **Type safety across the boundary is by convention.** `claimsMfe/ClaimsApp` is declared in `src/types/remotes.d.ts`; nothing verifies at build time that the remote still matches. The shared `@poc/contracts` package narrows this, but a contract test in CI is the real answer.
- Monorepo Babel configuration needs care: `.babelrc` is package-scoped and will not transpile symlinked workspace sources, so a root `babel.config.js` plus `rootMode: "upward"` is required. Noted because it cost time on this build.

---

## What to confirm with Aon

The shell-side contract is assumed from the DR references, not observed. Before committing to M2 (Requirements and Architecture Sign-off, 30 September 2026) the following need confirming against the real Meridian shell:

- Whether Meridian exposes remotes via Module Federation today, and its webpack major version
- The exact prop or context shape the shell already passes to embedded surfaces
- Whether the shell tolerates a remote declaring its own `react` version, or mandates a fixed singleton range
- How the shell surfaces a failed remote load to the user, so the containment fallback matches house style
