import { NextResponse } from "next/server";
import { STAFF_ROLES, appointmentIcs, getProfile } from "@vabrato/lib";
import { lengthText, type AppointmentFields } from "@/lib/appointment-kinds";
import { supabaseServer } from "@/lib/supabase-server";

// The calendar file for an approved appointment (S6b PR 8). Staff only; RLS
// decides which drafts they can read. It's a download: nothing is added to
// any calendar unless the person opens it.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) return notFound();
  const { data: a } = await supabase.from("ai_drafts").select("id, status, content").eq("id", id).eq("kind", "appointment").maybeSingle();
  if (!a || a.status !== "approved") return notFound();
  const f = a.content as unknown as AppointmentFields;
  if (!f?.date || !f.start || !f.minutes) return notFound();
  const description = [f.with ? `With ${f.with}.` : "", `${lengthText(f.minutes)}.`, "From the Vabrato console."].filter(Boolean).join(" ");
  const ics = appointmentIcs({ uid: a.id, title: f.title, date: f.date, start: f.start, minutes: f.minutes, location: f.location, description });
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="appointment-${f.date}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
