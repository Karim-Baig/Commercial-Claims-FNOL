/**
 * Real shell entry point.
 *
 * Loaded via a dynamic import from index.tsx so that Module Federation shared
 * singletons are initialised before React is consumed.
 */
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Shell mount point #root was not found");

createRoot(container).render(<App />);
