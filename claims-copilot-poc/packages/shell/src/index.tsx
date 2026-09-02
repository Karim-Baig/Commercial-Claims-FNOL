/**
 * Module Federation async boundary.
 *
 * Shared singletons (react, react-dom) are initialised asynchronously by the
 * federation runtime. If the entry chunk imports them synchronously webpack throws
 * "Shared module is not available for eager consumption" before any code runs.
 *
 * The dynamic import below defers the real entry into its own chunk, which gives the
 * share scope time to initialise. Keep this file free of static imports.
 *
 * See docs/adr/ADR-POC-001.
 */
import("./bootstrap");
