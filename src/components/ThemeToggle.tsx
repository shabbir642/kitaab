"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "light" | "dark" | "system";
const ORDER: Mode[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const KEY = "kitaab-theme";

/* The stored theme is external state, so it is read through
   useSyncExternalStore rather than mirrored into an effect. */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): Mode {
  try {
    const m = localStorage.getItem(KEY);
    return m === "light" || m === "dark" ? m : "system";
  } catch {
    // private browsing or blocked storage - the default look still works
    return "system";
  }
}

function setMode(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  for (const cb of listeners) cb();
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "system" as Mode);
  const Icon = ICON[mode];

  return (
    <button
      type="button"
      title={`Theme: ${mode} (click to change)`}
      aria-label={`Theme: ${mode}. Click to change.`}
      onClick={() => setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length])}
      className="grid size-8 place-items-center rounded-md border border-hairline text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}

/** Applies the saved theme before first paint so there is no flash. */
export const themeScript = `
try {
  var m = localStorage.getItem('${KEY}');
  if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
} catch (e) {}
`;
