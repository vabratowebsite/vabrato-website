import { NextResponse } from "next/server";
import { exchangeCodeForSession } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    console.error("[auth/callback] no code in URL:", url.search);
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }
  const supabase = await supabaseServer();
  const { error } = await exchangeCodeForSession(supabase, code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, url.origin),
    );
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
