import { NextResponse } from "next/server";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// The bell's data: the signed-in staff member's own in-console alerts (RLS:
// recipient only). GET lists them; POST marks them read (same-origin only).
// Never cached.

const NO_STORE = { "Cache-Control": "private, no-store" };
const LINKS: Record<string, (refId: string | null) => string> = {
  leads: (id) => (id ? `/leads/${id}` : "/leads"),
  messages: (id) => (id ? `/messages/${id}` : "/messages"),
  app_settings: () => "/settings",
  notifications: () => "/",
};

async function staff() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  return profile && STAFF_ROLES.includes(profile.role) ? supabase : null;
}

export async function GET() {
  const supabase = await staff();
  if (!supabase) return NextResponse.json({ error: "signed_out" }, { status: 401, headers: NO_STORE });
  const [{ data }, { count }] = await Promise.all([
    supabase.from("staff_notifications").select("id, kind, title, ref_table, ref_id, created_at, read_at").order("id", { ascending: false }).limit(15),
    supabase.from("staff_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const items = (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    href: (LINKS[n.ref_table ?? ""] ?? (() => "/"))(n.ref_id),
    createdAt: n.created_at,
    unread: !n.read_at,
  }));
  return NextResponse.json({ unread: count ?? 0, items }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "bad_origin" }, { status: 403, headers: NO_STORE });
  const supabase = await staff();
  if (!supabase) return NextResponse.json({ error: "signed_out" }, { status: 401, headers: NO_STORE });
  const { data } = await supabase.rpc("mark_staff_notifications_read", {});
  return NextResponse.json({ marked: data ?? 0 }, { headers: NO_STORE });
}
