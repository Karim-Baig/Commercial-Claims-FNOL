/**
 * A human-readable label for the current device, stamped onto saved FNOL drafts.
 *
 * This exists to make cross-device continuity legible rather than to identify
 * anyone: it is coarse by design (browser family plus platform), is derived from
 * the user agent the browser already sends on every request, and is only ever
 * shown back to the user who created the draft. No fingerprinting, no persistent
 * device id, nothing that would survive as a tracking identifier.
 */
export function currentDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";

  const ua = navigator.userAgent;

  // Order matters: Edge and Chrome both claim "Chrome", Chrome claims "Safari".
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" :
    "Browser";

  const platform =
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" :
    "";

  return platform ? `${browser} on ${platform}` : browser;
}
