/**
 * Play mode on/off, shared between the nav toggle and the stage without a
 * context provider. It is deliberately not persisted: play mode is a
 * per-visit opt-in, so a reload always returns to the plain page.
 */
import { useSyncExternalStore } from "react";

let active = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setPlayMode(next: boolean) {
  if (next === active) return;
  active = next;
  listeners.forEach((notify) => notify());
}

/** Whether play mode is on. Always false on the server and during hydration. */
export function usePlayMode() {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => false
  );
}
