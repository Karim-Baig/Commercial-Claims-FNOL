# @poc/uui-stub

Stand-in for **Aon United UI (UUI)** — Meridian Pattern **Layer 1**.

## Why this exists

NFR-49 makes UUI mandatory and requires a formal Aon Design System team exception for
any component not sourced from it. UUI is Aon-internal and not available to a POC, so
this package provides the same **export surface and prop shapes** we would expect from
`@aon/united-ui`.

## Swap path

```bash
npm remove @poc/uui-stub -w @poc/claims-mfe -w @poc/shell
npm add    @aon/united-ui -w @poc/claims-mfe -w @poc/shell
```

Then replace the single import line in each consumer. No component call sites change,
because the props are the same. That is the entire point of the stub.

## Accessibility

Every component carries the `aria-*` wiring, focus management and keyboard handling
that UUI is documented to provide, so WCAG 2.2 AA (NFR-48) is not a retrofit. Verify
with `npm run test:a11y` at the repo root once the axe suite is added.

## Components in Tier 1

Primitives — `Button` `IconButton` `TextField` `Textarea` `Select` `DatePicker` `Checkbox` `Radio`
Layout — `PageHeader` `Card` `Tabs` `Grid`
Data — `DataTable` `KpiTile` `StatusPill` `Timeline`
Feedback — `Modal` `Banner` `Spinner` `EmptyState` `ErrorState`
Forms — `Stepper` `FileUpload` `FormField`
