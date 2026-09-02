/** Locale-aware formatting (NFR-44). No hard-coded formats anywhere. */

export function money(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

export function compactMoney(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return money(value, currency, locale);
  }
}

export function date(iso: string | null | undefined, locale: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}

export function count(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

export function percent(value: number, locale: string): string {
  try {
    // The API sends 42.5 meaning 42.5%, so divide rather than re-scale the label.
    return new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(1)}%`;
  }
}

/**
 * Renders a KPI according to the unit the API declared, so a tile the dashboard
 * has no specific knowledge of still formats correctly.
 */
export function kpiValue(
  value: number,
  unit: string | undefined,
  currency: string,
  locale: string,
  daysLabel: (n: string) => string
): string {
  switch (unit) {
    case "count":
      return count(value, locale);
    case "percent":
      return percent(value, locale);
    case "days":
      return daysLabel(count(value, locale));
    case "money":
    default:
      return compactMoney(value, currency, locale);
  }
}

/** Date plus time of day, for message timestamps where the hour matters. */
export function dateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/**
 * Date and time rendered in an explicit zone, with that zone named (Epic 6).
 *
 * A claims timestamp with no zone is ambiguous the moment two people in different
 * countries read the same record, which is the normal case on a multi-country
 * programme. The zone comes from the resolved branding config rather than from the
 * reader's browser, so everyone working one programme quotes the same wall-clock time
 * back to each other.
 */
export function dateTimeInZone(
  iso: string | null | undefined,
  locale: string,
  timeZone?: string,
  label?: string
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    const text = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(d);
    return label ? `${text} ${label}` : text;
  } catch {
    // An unknown IANA zone must not blank the timestamp - fall back to browser local.
    return dateTime(iso, locale);
  }
}

/** Coarse "2 hours ago" phrasing for draft recency. Falls back to an absolute date. */
export function relativeTime(
  iso: string | null | undefined,
  locale: string
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["day", 86400],
    ["hour", 3600], ["minute", 60],
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    for (const [unit, secs] of units) {
      if (Math.abs(seconds) >= secs) return rtf.format(Math.round(seconds / secs), unit);
    }
    return rtf.format(0, "minute");
  } catch {
    return date(iso, locale);
  }
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
