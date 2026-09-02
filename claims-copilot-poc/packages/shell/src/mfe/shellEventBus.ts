import type { ShellEvent } from "@poc/contracts";

/**
 * Shell event interface (DR-3.8).
 *
 * The Micro-Frontend never manipulates shell chrome directly. It emits events and the
 * shell decides what to do with them, which keeps the two independently deployable.
 */
type Listener = (e: ShellEvent) => void;

const listeners = new Set<Listener>();

export const shellEventBus = {
  emit(e: ShellEvent) {
    listeners.forEach((l) => {
      try {
        l(e);
      } catch (err) {
        console.warn("[shell] event listener threw", err);
      }
    });
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
