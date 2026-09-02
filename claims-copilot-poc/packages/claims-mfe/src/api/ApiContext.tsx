import * as React from "react";
import { createTranslator } from "@poc/i18n";
import type { ShellEvent } from "@poc/contracts";

interface ApiCtx {
  get: <T>(path: string, params?: Record<string, unknown>) => Promise<T>;
  post: <T>(path: string, body: unknown, headers?: Record<string, string>) => Promise<T>;
  put: <T>(path: string, body: unknown, headers?: Record<string, string>) => Promise<T>;
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
  /**
   * Downloads a file and saves it to disk.
   *
   * Export endpoints require a Bearer token, so a plain anchor href or window.open
   * cannot be used - neither carries an Authorization header. The response is fetched
   * as a blob and handed to a temporary object URL instead.
   */
  download: (path: string, params?: Record<string, unknown>) => Promise<void>;
  /** API origin. Needed where a URL must be built rather than fetched, e.g. map tiles. */
  baseUrl: string;
  locale: string;
  groups: string[];
  emit: (e: ShellEvent) => void;
}

const Ctx = React.createContext<ApiCtx | null>(null);

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}

export interface ApiProviderProps {
  token: string;
  baseUrl: string;
  locale: string;
  groups: string[];
  onEvent?: (e: ShellEvent) => void;
  children: React.ReactNode;
}

export function ApiProvider({
  token, baseUrl, locale, groups, onEvent, children,
}: ApiProviderProps) {
  const value = React.useMemo<ApiCtx>(() => {
    async function request<T>(
      method: string,
      path: string,
      opts: { params?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> } = {}
    ): Promise<T> {
      const url = new URL(`${baseUrl}/api/v1${path}`);
      if (opts.params) {
        for (const [k, v] of Object.entries(opts.params)) {
          if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        }
      }
      const res = await fetch(url.toString(), {
        method,
        headers: {
          // DR-3.1: the token comes from the shell. The MFE never obtains one itself.
          Authorization: `Bearer ${token}`,
          "Accept-Language": locale,
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

      if (!res.ok) {
        let detail: string | undefined;
        try {
          const payload = (await res.json())?.detail;
          // FastAPI validation errors arrive as an array of objects, which would
          // otherwise reach the UI as "[object Object]".
          detail = typeof payload === "string" ? payload : JSON.stringify(payload);
        } catch { /* ignore */ }
        // NFR-41: plain-language message, localised (NFR-43); the technical detail
        // is kept separate so it never reaches the end user directly.
        const tr = createTranslator(locale);
        const message =
          res.status === 403
            ? tr("api.forbidden")
            : res.status === 404
            ? tr("api.not_found")
            : tr("api.generic");
        throw new ApiError(res.status, message, detail);
      }
      return (await res.json()) as T;
    }

    async function download(path: string, params?: Record<string, unknown>) {
      const url = new URL(`${baseUrl}/api/v1${path}`);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        }
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": locale },
      });

      if (!res.ok) {
        const tr = createTranslator(locale);
        throw new ApiError(
          res.status,
          res.status === 403 ? tr("api.forbidden") : tr("api.generic")
        );
      }

      // Prefer the server's filename so the export is named consistently wherever it
      // is triggered from.
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? path.split("/").pop() ?? "download";

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    }

    return {
      get: (path, params) => request("GET", path, { params }),
      post: (path, body, headers) => request("POST", path, { body, headers }),
      put: (path, body, headers) => request("PUT", path, { body, headers }),
      patch: (path, body, headers) => request("PATCH", path, { body: body ?? {}, headers }),
      del: (path) => request("DELETE", path),
      download,
      baseUrl,
      locale,
      groups,
      emit: (e) => onEvent?.(e),
    };
  }, [token, baseUrl, locale, groups, onEvent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApi(): ApiCtx {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useApi must be used inside ApiProvider");
  return c;
}

/** Small fetch-on-mount helper. A real build would use React Query. */
export function useResource<T>(
  fn: (api: ApiCtx) => Promise<T>,
  deps: React.DependencyList
): { data: T | null; loading: boolean; error: ApiError | null; reload: () => void } {
  const api = useApi();
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn(api)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => {
        if (!alive) return;
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(0, createTranslator(api.locale)("api.generic"))
        );
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
