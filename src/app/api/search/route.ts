import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { quickSearch } from "@/lib/queries";

/** Record lookup for the command palette. Small and capped - the full list
 *  page is where real searching happens. */
export async function GET(req: Request) {
  // A route handler answers machines, so an unauthenticated caller gets a
  // 401 rather than a redirect to a page it cannot render.
  const viewer = await currentUser();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ records: [] });

  const records = (await quickSearch(q, viewer, 6)).map((r) => ({
    id: r.id,
    assessmentId: r.assessmentId,
    name: r.name,
    location: r.location,
  }));
  return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
}
