declare global {
  interface Window {
    __POC_API_URL__?: string;
  }
}

export const API_BASE =
  window.__POC_API_URL__ && !window.__POC_API_URL__.includes("<%=")
    ? window.__POC_API_URL__
    : "http://localhost:8000";
