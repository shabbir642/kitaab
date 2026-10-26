import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { themeScript } from "@/components/ThemeToggle";
import { locationCounts, railCounts } from "@/lib/queries";
import { currentUser } from "@/lib/session";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kitaab", template: "%s · Kitaab" },
  description: "The book of assessment records - track, filter and analyse them.",
};

export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  // The rail's counts are absolute, so they are read once per request here
  // rather than threaded through every page. Independent reads go together:
  // over a network every await is a round trip.
  const user = await currentUser();

  // Signed out there is no shell to draw, and its counts would be a database
  // read on behalf of nobody - so the reads are skipped rather than merely
  // hidden. /login renders bare through here; every other page redirects to it
  // itself, which is why this layout does not redirect and cannot loop.
  const [counts, locations] = user
    ? await Promise.all([railCounts(user), locationCounts(user, 20)])
    : [null, null];

  return (
    <html
      lang="en"
      // the pre-paint theme script stamps data-theme before React hydrates
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full">
        {user && counts && locations ? (
          <AppShell
            counts={counts}
            locations={locations.map((l) => ({ location: l.location, count: l.count }))}
            locationTotal={locations[0]?.total ?? 0}
            userName={user.name}
            userRole={user.role}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
        {modal}
      </body>
    </html>
  );
}
