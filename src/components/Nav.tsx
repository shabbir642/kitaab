import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { NavLink } from "./NavLink";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-page/85 backdrop-blur">
      <div className="mx-auto flex h-13 max-w-[1600px] items-center gap-6 px-4 py-2.5 sm:px-6">
        <Link href="/assessments" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-md text-[11px] font-bold text-accent-ink"
            style={{ background: "var(--accent)" }}
          >
            K
          </span>
          Kitaab
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/assessments">Records</NavLink>
          <NavLink href="/analytics">Analytics</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
