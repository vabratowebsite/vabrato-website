import { NextResponse } from "next/server";
import { unsubscribeAlerts, UNSUBSCRIBE_TOKEN } from "@/member/unsubscribe";

// One-click unsubscribe target of the List-Unsubscribe header (RFC 8058).
// Mail providers POST "List-Unsubscribe=One-Click"; a GET (link scanners,
// someone pasting the URL) never unsubscribes and goes to the confirm page.
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!UNSUBSCRIBE_TOKEN.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400, headers });
  try {
    await unsubscribeAlerts(token);
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500, headers });
  }
  // Same answer whether or not the token matched an account.
  return NextResponse.json({ unsubscribed: true }, { headers });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = new URL("/alerts/unsubscribe", url.origin);
  const t = url.searchParams.get("t");
  if (t) page.searchParams.set("t", t);
  return NextResponse.redirect(page, { status: 303, headers });
}
