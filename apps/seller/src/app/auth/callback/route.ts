import { NextResponse } from "next/server";
import { exchangeCodeForSession } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    await exchangeCodeForSession(supabase, code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
