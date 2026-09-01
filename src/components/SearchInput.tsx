"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

/** Filters the list itself, unlike ⌘K which jumps somewhere. Typing here
 *  narrows the records in place. */
export function SearchInput({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(value);
  const [lastUrlQ, setLastUrlQ] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Adjust during render when the URL changes from elsewhere (a chip removed,
  // Back, a saved view) rather than syncing in an effect.
  if (lastUrlQ !== value) {
    setLastUrlQ(value);
    setQ(value);
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (q === value) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString());
      if (q) p.set("q", q);
      else p.delete("q");
      p.delete("page");
      const qs = p.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // "/" jumps here, the way it does in most list UIs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full sm:w-64">
      <Search
        size={13}
        strokeWidth={2}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by keyword"
        aria-label="Filter records by keyword"
        className="h-9 w-full rounded-md border border-hairline bg-surface pl-[26px] pr-14 text-[12.5px] text-ink placeholder:text-ink-muted focus:border-hairline-strong focus:outline-none sm:h-[26px] sm:text-[11.5px]"
      />
      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {pending && <Loader2 size={11} className="animate-spin text-ink-muted" aria-hidden />}
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear keyword"
            className="-m-2 p-2 text-ink-muted hover:text-ink"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        ) : (
          <kbd className="hidden rounded-[3px] bg-surface-sunken px-1 font-mono text-[9.5px] text-ink-muted lg:inline">/</kbd>
        )}
      </span>
    </div>
  );
}
