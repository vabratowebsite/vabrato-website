import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { CalendarView } from "./calendar-view";

export const dynamic = "force-dynamic";

export default async function DealCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;

  const supabase = await supabaseServer();
  const { data: tasks } = await supabase.from("tasks").select("id, title, owner, due_date, done").eq("deal_id", id).order("due_date");

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="calendar">
      <CalendarView tasks={tasks ?? []} ratification={deal.ratification_date} />
    </DealShell>
  );
}
