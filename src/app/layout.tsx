import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { themeScript } from "@/components/ThemeToggle";
import { locationCounts, railCounts } from "@/lib/queries";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kitaab", template: "%s · Kitaab" },
  description: "The book of assessment records - track, filter and analyse them.",
};

export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  // The rail's counts are absolute, so they are read once per request here
  // rather than threaded through every page.
  const counts = railCounts();
  const locations = locationCounts(20);

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
        <AppShell
          counts={counts}
          locations={locations.map((l) => ({ location: l.location, count: l.count }))}
          locationTotal={locations[0]?.total ?? 0}
        >
          {children}
        </AppShell>
        {modal}
      </body>
    </html>
  );
}
