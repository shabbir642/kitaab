"use client";

import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
   A boolean that survives reloads.

   Read through useSyncExternalStore rather than mirrored into an effect: the
   server has no localStorage, so the first render must agree with it and then
   pick up the stored value without a second render pass.
--------------------------------------------------------------------------- */

const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string) {
  return (cb: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(cb);
    listeners.set(key, set);
    window.addEventListener("storage", cb);
    return () => {
      set.delete(cb);
      window.removeEventListener("storage", cb);
    };
  };
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    // private browsing or blocked storage - fall back to the default
    return false;
  }
}

export function setStoredFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore - the toggle still works for this page view */
  }
  for (const cb of listeners.get(key) ?? []) cb();
}

/** Always false on the server and on first paint, then the stored value. */
export function useStoredFlag(key: string): boolean {
  return useSyncExternalStore(
    subscribe(key),
    () => read(key),
    () => false,
  );
}
