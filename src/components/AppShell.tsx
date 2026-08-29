"use client";

import { Suspense, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { Rail } from "./Rail";
import type { RailCounts } from "@/lib/queries";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<div className="w-[236px] shrink-0 border-r border-hairline bg-surface-sunken" />}>
        <Rail
          counts={counts}
          locations={locations}
          locationTotal={locationTotal}
          onOpenPalette={() => setPaletteOpen(true)}
        />
      </Suspense>

      <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        locations={locations}
      />
    </div>
  );
}
