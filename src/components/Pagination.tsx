"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PER_PAGE_OPTIONS } from "@/lib/filters";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  perPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
}) {
  const searchParams = useSearchParams();

  const href = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-secondary">
      <p className="tabular-nums">
        {total === 0 ? "No records" : `${from}–${to} of ${total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-muted">Rows</span>
          <PerPage current={perPage} href={href} />
        </label>
        <div className="flex items-center gap-1">
          <PageLink disabled={page <= 1} href={href((p) => p.set("page", String(page - 1)))} label="Previous page">
            <ChevronLeft size={14} strokeWidth={2} />
          </PageLink>
          <span className="px-1 tabular-nums">
            {page} / {pageCount}
          </span>
          <PageLink disabled={page >= pageCount} href={href((p) => p.set("page", String(page + 1)))} label="Next page">
            <ChevronRight size={14} strokeWidth={2} />
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function PerPage({
  current,
  href,
}: {
  current: number;
  href: (mutate: (p: URLSearchParams) => void) => string;
}) {
  return (
    <span className="flex overflow-hidden rounded-md border border-hairline">
      {PER_PAGE_OPTIONS.map((n) => (
        <Link
          key={n}
          scroll={false}
          href={href((p) => {
            p.set("perPage", String(n));
            p.delete("page");
          })}
          className={cn(
            "grid min-w-9 place-items-center px-2.5 py-2.5 tabular-nums transition-colors sm:min-w-0 sm:px-1.5 sm:py-0.5",
            n === current ? "bg-surface-sunken font-medium text-ink" : "hover:bg-surface-sunken",
          )}
        >
          {n}
        </Link>
      ))}
    </span>
  );
}

function PageLink({
  disabled,
  href,
  label,
  children,
}: {
  disabled: boolean;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span aria-disabled className="grid size-9 place-items-center rounded-md border border-hairline text-ink-muted opacity-40 sm:size-7">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className="grid size-9 place-items-center rounded-md border border-hairline hover:bg-surface-sunken hover:text-ink sm:size-7"
    >
      {children}
    </Link>
  );
}
