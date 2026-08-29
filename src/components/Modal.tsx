"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/** Dismisses by going back, so the modal and its own URL stay in step: the
 *  same route rendered directly is a full page. */
export function Modal({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-[6vh]"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-hairline-strong bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md border border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto px-5 py-5 thin-scroll">{children}</div>
      </div>
    </div>
  );
}
