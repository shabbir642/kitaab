import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Our colour tokens are custom names, so tailwind-merge would otherwise read
 *  `text-ink` as a font-size utility and drop the `text-xs` beside it.
 *  Declaring them as colours keeps size and colour in separate groups. */
const COLORS = [
  "page", "surface", "surface-raised", "surface-sunken",
  "ink", "ink-secondary", "ink-muted",
  "grid", "baseline", "hairline", "hairline-strong",
  "accent", "accent-ink", "accent-wash",
];

const twMerge = extendTailwindMerge({ extend: { theme: { color: COLORS } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats a stored YYYY-MM-DD without going through Date(), so the value can
 *  never shift by a day because of the machine's timezone. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Two-digit year, for dense cells where the full form wraps. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDate(d.toISOString().slice(0, 10))}, ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pct(n: number, of: number): string {
  if (!of) return "0%";
  return `${Math.round((n / of) * 100)}%`;
}
