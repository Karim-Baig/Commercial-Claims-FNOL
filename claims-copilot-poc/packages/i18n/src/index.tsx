import * as React from "react";

/**
 * Localisation runtime.
 *
 * Traceability
 *   NFR-42  Multilingual, including right-to-left scripts. English is the default.
 *   NFR-43  All user-facing text is externalised into resource files. No component
 *           in this repository contains a literal user-facing string.
 *   NFR-44  Adding or modifying a locale requires no code change - drop a JSON file
 *           into ./locales and it is discovered automatically.
 *
 * Discovery is done with require.context, so the set of available locales is derived
 * from the directory contents rather than from a hand-maintained list. That is what
 * makes the NFR-44 claim literally true: no source file names the locales.
 */

export interface LocaleMeta {
  label: string;
  dir: "ltr" | "rtl";
  currency: string;
}

export type Bundle = Record<string, string> & { _meta?: LocaleMeta };

export interface LocaleDescriptor {
  code: string;
  meta: LocaleMeta;
}

export const FALLBACK_LOCALE = "en-US";

// ─────────────────────────────────────────────────── discovery
declare const require: {
  context(
    path: string,
    deep?: boolean,
    filter?: RegExp
  ): { keys(): string[]; (id: string): unknown };
};

const BUNDLES: Record<string, Bundle> = {};

const ctx = require.context("../locales", false, /\.json$/);
ctx.keys().forEach((key) => {
  const code = key.replace(/^\.\//, "").replace(/\.json$/, "");
  const mod = ctx(key) as Bundle | { default: Bundle };
  BUNDLES[code] = (mod as { default?: Bundle }).default ?? (mod as Bundle);
});

const DEFAULT_META: LocaleMeta = { label: "Unknown", dir: "ltr", currency: "USD" };

/** Every locale found on disk, English first, then alphabetical by label. */
export const availableLocales: LocaleDescriptor[] = Object.keys(BUNDLES)
  .map((code) => ({ code, meta: BUNDLES[code]._meta ?? DEFAULT_META }))
  .sort((a, b) =>
    a.code === FALLBACK_LOCALE ? -1 : b.code === FALLBACK_LOCALE ? 1
      : a.meta.label.localeCompare(b.meta.label)
  );

export function getLocaleMeta(locale: string): LocaleMeta {
  return BUNDLES[locale]?._meta ?? BUNDLES[FALLBACK_LOCALE]?._meta ?? DEFAULT_META;
}

export function isRtl(locale: string): boolean {
  return getLocaleMeta(locale).dir === "rtl";
}

// ─────────────────────────────────────────────────── translation
export type TranslateParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TranslateParams) => string;

/**
 * Resolves a key with a fallback chain: requested locale, then en-US, then the key
 * itself. Returning the key rather than an empty string means a missing translation
 * is visible in the UI instead of silently blanking a label.
 */
export function createTranslator(locale: string): TFunction {
  const primary = BUNDLES[locale] ?? {};
  const fallback = BUNDLES[FALLBACK_LOCALE] ?? {};

  return function t(key, params) {
    const template = primary[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const value = params[name];
      return value === undefined ? `{${name}}` : String(value);
    });
  };
}

// ─────────────────────────────────────────────────── React binding
export interface I18nValue {
  locale: string;
  dir: "ltr" | "rtl";
  meta: LocaleMeta;
  t: TFunction;
  locales: LocaleDescriptor[];
}

const I18nContext = React.createContext<I18nValue | null>(null);

export interface I18nProviderProps {
  locale: string;
  children: React.ReactNode;
}

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const value = React.useMemo<I18nValue>(() => {
    const meta = getLocaleMeta(locale);
    return {
      locale,
      dir: meta.dir,
      meta,
      t: createTranslator(locale),
      locales: availableLocales,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Returns the active translator.
 *
 * Falls back to an English translator when no provider is present, so a component can
 * be rendered in isolation (a Storybook entry, a unit test) without being wrapped.
 */
export function useI18n(): I18nValue {
  const ctxValue = React.useContext(I18nContext);
  return React.useMemo<I18nValue>(() => {
    if (ctxValue) return ctxValue;
    const meta = getLocaleMeta(FALLBACK_LOCALE);
    return {
      locale: FALLBACK_LOCALE,
      dir: meta.dir,
      meta,
      t: createTranslator(FALLBACK_LOCALE),
      locales: availableLocales,
    };
  }, [ctxValue]);
}

/** Convenience hook when only the translate function is needed. */
export function useT(): TFunction {
  return useI18n().t;
}

// ─────────────────────────────────────────────────── value mapping
const SLUG = (value: string) =>
  value.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Translates a value that arrives from the API as English text.
 *
 * Claim status, product line and timeline milestones are stored and transmitted in
 * English. Rather than leak that through to the interface, they are mapped to
 * `<namespace>.<slug>` keys. An unmapped value falls through to the original text, so
 * a new status added server-side degrades to English instead of breaking the screen.
 */
export function translateValue(
  t: TFunction,
  namespace: string,
  value: string | null | undefined
): string {
  if (!value) return t("common.dash");
  const key = `${namespace}.${SLUG(value)}`;
  const resolved = t(key);
  return resolved === key ? value : resolved;
}
