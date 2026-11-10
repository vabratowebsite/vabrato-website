import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { flagEnabled } from "@/lib/public/listings";
import { JOIN_COOKIE, applyPendingJoin, decodePendingJoin, safeNext } from "@/member/join";
import { memberSupabase } from "@/member/supabase-server";

// Magic-link and Google sign-in land here: exchange the PKCE code for a
// session, then apply the join choices carried in the pending cookie (role,
// alert emails, VOW terms). Without them, /my shows the onboarding step
// (review item 13).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const failTo = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}&next=${encodeURIComponent(next)}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return failTo(url.searchParams.get("error") ? "denied" : "link");

  const supabase = await memberSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failTo("link");

  const store = await cookies();
  const pending = decodePendingJoin(store.get(JOIN_COOKIE)?.value);
  if (pending) {
    const failed = await applyPendingJoin(supabase, pending, { vowEnabled: await flagEnabled("vow_enabled") });
    if (failed.length) console.error("join choices not applied", { steps: failed });
    store.set(JOIN_COOKIE, "", { path: "/auth", maxAge: 0 });
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
