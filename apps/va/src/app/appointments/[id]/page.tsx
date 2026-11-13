import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { AppointmentEditor } from "@/components/appointment-editor";
import { ConsoleShell } from "@/components/console-shell";
import { mutedCls } from "@/components/ui";
import { lengthText, whenText, type AppointmentFields } from "@/lib/appointment-kinds";
import type { AppointmentView } from "@/lib/call-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// One appointment draft (S6b PR 8): check and approve it, then add it to a
// calendar with the file and send the confirmation yourself. RLS: the person
// who drafted it, and once approved, staff who work the lead or the deal.
export const dynamic = "force-dynamic";

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: a } = await supabase.from("ai_drafts").select("id, status, content, subject, body, sent_via, lead_id, deal_id, owner_id").eq("id", id).eq("kind", "appointment").maybeSingle();
  if (!a || a.status === "discarded") notFound();

  let back = { href: "/assistant", label: "My drafts" };
  let emailTo: string[] = [];
  if (a.lead_id) {
    const { data: lead } = await supabase.from("leads").select("name, email").eq("id", a.lead_id).maybeSingle();
    back = { href: `/leads/${a.lead_id}`, label: lead?.name || "The lead" };
    emailTo = lead?.email ? [lead.email] : [];
  } else if (a.deal_id) {
    const [{ data: deal }, { data: members }] = await Promise.all([
      supabase.from("deals").select("address").eq("id", a.deal_id).maybeSingle(),
      supabase.from("deal_members").select("profiles(email)").eq("deal_id", a.deal_id).eq("member_role", "seller"),
    ]);
    back = { href: `/deals/${a.deal_id}`, label: deal?.address ?? "The transaction" };
    emailTo = (members ?? []).map((m) => (m.profiles as { email: string | null } | null)?.email ?? "").filter(Boolean);
  }
  const fields = a.content as unknown as AppointmentFields;
  const view: AppointmentView = { id: a.id, status: a.status as AppointmentView["status"], fields, subject: a.subject, body: a.body, sent_via: a.sent_via };
  const summary = fields.date && fields.start ? `${whenText(fields.date, fields.start)}${fields.minutes ? `, ${lengthText(fields.minutes)}` : ""}` : "Date and time to be set";

  return (
    <ConsoleShell profile={profile} current={a.lead_id ? "leads" : "deals"} eyebrow="Appointment" title={fields.title || "Appointment"}>
      <Link href={back.href} className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline print:hidden">
        ← {back.label}
      </Link>
      <Panel title={summary}>
        {a.owner_id !== profile.id && <p className={`${mutedCls} mb-3`}>Drafted and approved by someone else on this file.</p>}
        <AppointmentEditor initial={view} emailTo={emailTo} backHref={back.href} />
      </Panel>
    </ConsoleShell>
  );
}
