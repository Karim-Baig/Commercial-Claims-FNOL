import * as React from "react";

/**
 * Claims list filter state.
 *
 * One object holds every criterion the API accepts, so the list query, the export and
 * a saved view all describe the filter set the same way. That is what stops an export
 * from quietly returning something other than what was on screen.
 *
 * Traceability: Figure 3 (p. 16) shows status, sub-status, product and sub-product
 * filters; Epic 3 (p. 62) names status, line of business, date range, adjuster and
 * reserve amount.
 */
export interface ClaimFilterState {
  q: string;
  status: string;
  sub_status: string;
  product: string;
  product_category: string;
  adjuster: string;
  claim_type: string;
  date_from: string;
  date_to: string;
  reserve_min: string;
  reserve_max: string;
  // Added for the Epic 4 drill-down: the analytics container groups by cause,
  // consequence and carrier, and a chart you cannot drill into is a dead end.
  cause_of_loss: string;
  consequence_of_loss: string;
  carrier: string;
}

export const EMPTY_FILTERS: ClaimFilterState = {
  q: "",
  status: "",
  sub_status: "",
  product: "",
  product_category: "",
  adjuster: "",
  claim_type: "",
  date_from: "",
  date_to: "",
  reserve_min: "",
  reserve_max: "",
  cause_of_loss: "",
  consequence_of_loss: "",
  carrier: "",
};

/** Criteria that live in the collapsible panel rather than the always-visible row. */
export const ADVANCED_KEYS: (keyof ClaimFilterState)[] = [
  "sub_status", "product_category", "adjuster", "claim_type",
  "date_from", "date_to", "reserve_min", "reserve_max",
  "cause_of_loss", "consequence_of_loss", "carrier",
];

/** Strips empty values so the query string carries only what the user actually set. */
export function toQuery(f: ClaimFilterState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== "" && v != null)
  ) as Record<string, string>;
}

export function activeCount(f: ClaimFilterState): number {
  return Object.values(f).filter((v) => v !== "" && v != null).length;
}

export function advancedActiveCount(f: ClaimFilterState): number {
  return ADVANCED_KEYS.filter((k) => f[k] !== "" && f[k] != null).length;
}

/** Merges a saved view's stored criteria over a clean slate. */
export function fromSaved(stored: Record<string, unknown>): ClaimFilterState {
  const next: ClaimFilterState = { ...EMPTY_FILTERS };
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof ClaimFilterState)[]) {
    const v = stored[key];
    if (v !== undefined && v !== null) next[key] = String(v);
  }
  return next;
}

export interface UseClaimFilters {
  filters: ClaimFilterState;
  /** Debounced copy used to drive requests, so typing does not fire one per keystroke. */
  applied: ClaimFilterState;
  set: <K extends keyof ClaimFilterState>(key: K, value: string) => void;
  replaceAll: (next: ClaimFilterState) => void;
  clear: () => void;
  activeCount: number;
  advancedActiveCount: number;
}

/**
 * @param initial Criteria to open with, used when the analytics container drills
 *   through to the list. Applied immediately rather than debounced, so the list does
 *   not flash the unfiltered set first.
 */
export function useClaimFilters(
  onChange?: () => void,
  initial?: Partial<ClaimFilterState>
): UseClaimFilters {
  const seeded = React.useMemo(
    () => (initial ? fromSaved(initial as Record<string, unknown>) : EMPTY_FILTERS),
    // Deliberately keyed on the value, not the identity: the caller rebuilds this
    // object every render, and depending on identity would reset the user's own edits.
    [JSON.stringify(initial ?? {})]
  );

  const [filters, setFilters] = React.useState<ClaimFilterState>(seeded);
  const [applied, setApplied] = React.useState<ClaimFilterState>(seeded);

  // Only the free-text field needs debouncing, but debouncing the whole object keeps
  // one code path and costs nothing perceptible on a select.
  React.useEffect(() => {
    const h = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(h);
  }, [filters]);

  const set = React.useCallback(
    <K extends keyof ClaimFilterState>(key: K, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      onChange?.();
    },
    [onChange]
  );

  const replaceAll = React.useCallback(
    (next: ClaimFilterState) => {
      setFilters(next);
      setApplied(next);   // loading a saved view should apply immediately
      onChange?.();
    },
    [onChange]
  );

  const clear = React.useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    onChange?.();
  }, [onChange]);

  return {
    filters,
    applied,
    set,
    replaceAll,
    clear,
    activeCount: activeCount(filters),
    advancedActiveCount: advancedActiveCount(filters),
  };
}

/** Option lists and numeric bounds, scoped server-side to the caller's own claims. */
export interface FilterOptions {
  status: string[];
  sub_status: string[];
  product: string[];
  product_category: string[];
  adjuster: string[];
  claim_type: string[];
  reserve_min: number;
  reserve_max: number;
  date_min: string | null;
  date_max: string | null;
}
