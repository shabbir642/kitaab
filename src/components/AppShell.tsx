"use client";

import { Suspense, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { Rail } from "./Rail";
import type { RailCounts } from "@/lib/queries";
import { setStoredFlag, useStoredFlag } from "@/lib/useStoredFlag";

const COLLAPSED_KEY = "kitaab-rail-collapsed";

export function AppShell({
  counts,
  locations,
  locationTotal,
  children,
}: {
  counts: RailCounts;
  locations: { location: string; count: number }[];
  locationTotal: number;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Two different things: below lg the rail is a drawer that opens over the
  // content; from lg it is a column that narrows to icons.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const collapsed = useStoredFlag(COLLAPSED_KEY);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The drawer covers the page, so the page behind it must not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(0,0,0,0.45)" }}
          role="presentation"
        />
      )}

      <Suspense
        fallback={
          <div className="hidden w-[236px] shrink-0 border-r border-hairline bg-surface-sunken lg:block" />
        }
      >
        <Rail
          counts={counts}
          locations={locations}
          locationTotal={locationTotal}
          onOpenPalette={() => setPaletteOpen(true)}
          open={drawerOpen}
          collapsed={collapsed}
          onToggleCollapsed={() => setStoredFlag(COLLAPSED_KEY, !collapsed)}
          onClose={() => setDrawerOpen(false)}
        />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Only below lg, where the rail is off-canvas and needs a way back. */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open the sidebar"
            aria-expanded={drawerOpen}
            className="grid size-9 place-items-center rounded-md border border-hairline text-ink-secondary"
          >
            <Menu size={16} strokeWidth={2} />
          </button>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-[20px] place-items-center rounded-md text-[10px] font-bold text-accent-ink"
              style={{ background: "var(--accent)" }}
            >
              K
            </span>
            <span className="text-[13px] font-semibold tracking-tight">Kitaab</span>
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="ml-auto grid size-9 place-items-center rounded-md border border-hairline text-ink-secondary"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </div>

        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        locations={locations}
      />
    </div>
  );
}
