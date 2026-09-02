/**
 * Standalone development harness.
 *
 * Lets the Micro-Frontend run on its own at :3001 without the shell, which is what
 * makes independent development and deployment practical (DR-3.7). In the real
 * Meridian portal this never executes - the shell imports ./ClaimsApp directly.
 *
 * Loaded via a dynamic import from index.tsx so Module Federation shared singletons
 * are initialised before React is consumed.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import ClaimsApp from "./ClaimsApp";
// The harness chrome below is developer-facing scaffolding, not part of the client
// experience, so its own two labels stay in English. Everything inside ClaimsApp is
// fully localised.
import { Banner, Select, tokens as t, availableLocales, isRtl } from "@poc/uui-stub";

const API = "http://localhost:8000";

function Harness() {
  const [token, setToken] = React.useState<string | null>(null);
  const [personaId, setPersonaId] = React.useState("1");
  const [locale, setLocale] = React.useState("en-US");
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  }, [locale]);

  const load = React.useCallback(async (id: string) => {
    setErr(null);
    try {
      const r = await fetch(`${API}/api/v1/auth/mock-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: Number(id) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setToken((await r.json()).access_token);
    } catch {
      setErr("Claims API not reachable on :8000.");
    }
  }, []);

  React.useEffect(() => {
    void load(personaId);
  }, [personaId, load]);

  const claims = token ? JSON.parse(atob(token.split(".")[1])) : null;

  return (
    <div>
      <div
        style={{
          background: t.color.amber050,
          borderBottom: `1px solid ${t.color.amber600}33`,
          padding: `${t.space(2)} ${t.space(4)}`,
          display: "flex",
          alignItems: "center",
          gap: t.space(4),
          flexWrap: "wrap",
        }}
      >
        <strong style={{ font: `${t.font.size.sm} ${t.font.family}`, color: t.color.amber600 }}>
          Standalone MFE harness
        </strong>
        <span style={{ font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey700 }}>
          Not the shell. Open http://localhost:3000 for the full Meridian experience.
        </span>
        <div style={{ marginInlineStart: "auto", minWidth: 170 }}>
          <Select
            aria-label="Locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            options={availableLocales.map((l) => ({
              value: l.code,
              label: l.meta.label + (l.meta.dir === "rtl" ? " (RTL)" : ""),
            }))}
          />
        </div>

        <div style={{ minWidth: 230 }}>
          <Select
            aria-label="Persona"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            options={[
              { value: "1", label: "P1 C-Suite (CORP-HOSP)" },
              { value: "3", label: "P3 Airport Director (LOC-JFK)" },
              { value: "5", label: "P5 Restaurant Mgr (T4-BISTRO)" },
              { value: "6", label: "P6 Reporter (own claims only)" },
              { value: "7", label: "P7 Unauthorised (no scope)" },
            ]}
          />
        </div>
      </div>

      {err && (
        <div style={{ padding: t.space(4) }}>
          <Banner tone="error">{err}</Banner>
        </div>
      )}

      {token && claims && (
        <ClaimsApp
          authToken={token}
          orgNode={claims.org_node}
          userGroups={claims.groups}
          locale={locale}
          claimId={null}
          apiBaseUrl={API}
          onEvent={(e) => console.log("[harness] shell event", e)}
        />
      )}
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("MFE mount point #root was not found");

createRoot(container).render(<Harness />);
