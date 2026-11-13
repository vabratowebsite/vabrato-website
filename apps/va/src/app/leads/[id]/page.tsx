import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ApprovedDrafts } from "@/components/approved-drafts";
import { AppointmentStarter, CallNotesPanel, TodoList } from "@/components/calls";
import { DraftPanel } from "@/components/draft-panel";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, inputCls, labelCls, mutedCls } from "@/components/ui";
import { draftsFor } from "@/lib/draft-data";
import { DRAFT_KINDS, leadDraftKind } from "@/lib/draft-kinds";
import { addLeadNoteAction, markRepliedAction, reassignLeadAction, setLeadStatusAction } from "@/lib/lead-actions";
import { STATUS_LABEL, fmtDuration, payloadRows } from "@/lib/leads";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen, leadKindLabel } from "@/lib/today";
import { appointmentsFor, todosFor } from "@/lib/todos";

// One lead: contact details (staff only, behind sign-in), the request, owner
// and status, notes, and how fast the alert email went out. RLS: the acting
// lead admin or the assignee; anyone else gets a 404.
export const dynamic = "force-dynamic";

const SITE = (process.env.PUBLIC_SITE_URL ?? "https://vabrato.com").replace(/\/+$/, "");

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const draftKind = leadDraftKind(lead.kind);
  const [{ data: notes }, { data: acting }, { data: alerts }, { data: agents }, drafts] = await Promise.all([
    supabase.from("lead_notes").select("id, body, created_at, author_id").eq("lead_id", id).order("created_at"),
    supabase.rpc("is_acting_lead_admin"),
    supabase.from("notifications").select("template_key, created_at, sent_at, status, attempts").like("dedupe_key", `%:${id}:%`).order("created_at"),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["admin", "agent"]).order("full_name"),
    draftsFor(supabase, profile.id, { lead_id: id }, [draftKind, "call_followup", "appointment"]),
  ]);
  const [todos, appointments] = await Promise.all([todosFor(supabase, { lead_id: id }), drafts.on.appointment ? appointmentsFor(supabase, profile.id, { lead_id: id }) : Promise.resolve([])]);
  // A portal message only when this person may write to that member (assigned to them, or an admin).
  const { data: canMessage } = lead.profile_id ? await supabase.rpc("can_see_member", { p_profile: lead.profile_id }) : { data: false };
  const people = new Map((agents ?? []).map((a) => [a.id, a.full_name || a.email]));
  const authorIds = [...new Set((notes ?? []).map((n) => n.author_id).filter((x): x is string => Boolean(x) && !people.has(x as string)))];
  if (authorIds.length) {
    const { data: more } = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds);
    for (const p of more ?? []) people.set(p.id, p.full_name || p.email);
  }
  const owner = lead.assigned_to ? (lead.assigned_to === profile.id ? "You" : (people.get(lead.assigned_to) ?? "Staff")) : "Unassigned";
  const details = payloadRows(lead.payload);
  const newLeadMail = (alerts ?? []).find((a) => a.template_key === "staff_new_lead");
  const firstReplyIn = lead.first_reply_at ? fmtDuration(Date.parse(lead.first_reply_at) - Date.parse(lead.created_at)) : null;

  return (
    <ConsoleShell profile={profile} current="leads" eyebrow={`Lead · ${leadKindLabel(lead.kind)}`} title={lead.name || lead.email}>
      <Link href="/leads" className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
        ← All leads
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Contact">
            <dl className="grid gap-4 font-body text-body-sm text-ink sm:grid-cols-2">
              <Item label="Name" value={lead.name || "Not given"} />
              <div>
                <dt className="text-label uppercase tracking-label text-muted">Email</dt>
                <dd>
                  <a href={`mailto:${lead.email}`} className="break-all text-navy underline">
                    {lead.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-label uppercase tracking-label text-muted">Phone</dt>
                <dd>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`} className="text-navy underline">
                      {lead.phone}
                    </a>
                  ) : (
                    "Not given"
                  )}
                </dd>
              </div>
              <Item label="Call or text OK" value={lead.consent_contact ? "Yes" : "No: email only"} />
            </dl>
            {lead.profile_id && (
              <p className={`${mutedCls} mt-4`}>
                This person has a member account.{" "}
                <Link href={`/messages/${lead.profile_id}`} className="text-navy underline">
                  Open their messages
                </Link>
              </p>
            )}
          </Panel>

          <Panel title="Request">
            <dl className="grid gap-4 font-body text-body-sm text-ink sm:grid-cols-2">
              <Item label="Kind" value={leadKindLabel(lead.kind)} />
              <Item label="Received" value={`${fmtWhen(lead.created_at)} on ${lead.site === "sancarloslife" ? "homes.sancarloslife.com" : "vabrato.com"}`} />
              {lead.listing_key && (
                <div>
                  <dt className="text-label uppercase tracking-label text-muted">Listing</dt>
                  <dd>
                    <a href={`${SITE}/listing/${lead.listing_key}/x`} className="text-navy underline">
                      {lead.listing_key}
                    </a>
                  </dd>
                </div>
              )}
              {lead.city_slug && <Item label="City" value={lead.city_slug.replace(/-/g, " ")} />}
              {details.map((d) => (
                <Item key={d.label} label={d.label} value={d.value} />
              ))}
            </dl>
            {lead.message && (
              <div className="mt-4">
                <p className="text-label uppercase tracking-label text-muted">Message</p>
                <p className="mt-1 whitespace-pre-wrap break-words font-body text-body-sm text-ink">{lead.message}</p>
              </div>
            )}
          </Panel>

          {(drafts.on[draftKind] || drafts.on.call_followup || drafts.on.appointment || drafts.approved.length > 0) && (
            <Panel title="Assistant">
              <div className="space-y-8">
              {drafts.on[draftKind] ? (
                <DraftPanel
                  heading={DRAFT_KINDS[draftKind].heading}
                  target={{ target: "lead", leadId: id }}
                  initial={drafts.open[draftKind] ?? null}
                  emailTo={[lead.email]}
                  portal={Boolean(lead.profile_id && canMessage)}
                  noteLabel="Anything it should say? (optional)"
                  noteHint="For example: offer Saturday morning for a showing. Don't add phone numbers or other personal details; you can add them to the email yourself."
                />
              ) : (
                <p className={mutedCls}>The assistant&apos;s {DRAFT_KINDS[draftKind].name.toLowerCase()} are off.</p>
              )}
              {drafts.on.call_followup && (
                <CallNotesPanel target={{ kind: "lead", id }} initialFollowup={drafts.open.call_followup ?? null} emailTo={[lead.email]} portal={Boolean(lead.profile_id && canMessage)} />
              )}
              {drafts.on.appointment && <AppointmentStarter target={{ kind: "lead", id }} appointments={appointments} />}
              </div>
              <ApprovedDrafts drafts={drafts.approved} />
            </Panel>
          )}

          {todos.ready && (
            <Panel title={`To-dos (${todos.todos.length})`}>
              <p className={`${mutedCls} mb-3`}>For staff only: the person who contacted us never sees these.</p>
              <TodoList target={{ kind: "lead", id }} todos={todos.todos} empty="No open to-dos." />
            </Panel>
          )}

          <Panel title="Notes">
            {notes?.length ? (
              <ol aria-label="Notes, oldest first" className="mb-4 space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="border border-line p-3 font-body text-body-sm">
                    <p className="text-caption text-muted">
                      {(n.author_id && (n.author_id === profile.id ? "You" : people.get(n.author_id))) || "Staff"} · {fmtWhen(n.created_at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-ink">{n.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={`${mutedCls} mb-4`}>No notes yet.</p>
            )}
            <ActionForm action={addLeadNoteAction.bind(null, id)} submitLabel="Add note" pendingLabel="Adding…" resetOnOk>
              <label className={labelCls}>
                Note
                <textarea name="body" rows={3} maxLength={2000} required className={`${inputCls} mt-1`} />
              </label>
            </ActionForm>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Status">
            <dl className="mb-4 space-y-3 font-body text-body-sm text-ink">
              <div className="flex flex-wrap items-center gap-2">
                <dt className="sr-only">Status</dt>
                <dd>
                  <Pill tone={lead.status === "new" ? "red" : lead.status === "assigned" ? "gold" : "outline"}>{STATUS_LABEL[lead.status] ?? lead.status}</Pill>
                </dd>
                {lead.escalated_at && !lead.first_reply_at && <Pill tone="outline">Escalated {fmtWhen(lead.escalated_at)}</Pill>}
              </div>
              <Item label="Owner" value={owner} />
              <Item label="First reply" value={firstReplyIn ? `${firstReplyIn} after it came in` : "Not yet"} />
              {lead.closed_reason && <Item label="Closed because" value={lead.closed_reason} />}
            </dl>
            <div className="space-y-4">
              {!lead.first_reply_at && lead.status !== "closed" && (
                <form action={markRepliedAction.bind(null, id)}>
                  <button type="submit" className={btnPrimary}>
                    I&apos;ve replied
                  </button>
                </form>
              )}
              {lead.status === "closed" ? (
                <ActionForm action={setLeadStatusAction.bind(null, id)} submitLabel="Reopen" secondary>
                  <input type="hidden" name="status" value="assigned" />
                </ActionForm>
              ) : (
                <ActionForm action={setLeadStatusAction.bind(null, id)} submitLabel="Close lead" secondary>
                  <input type="hidden" name="status" value="closed" />
                  <label className={labelCls}>
                    Reason (optional)
                    <input name="reason" maxLength={200} className={`${inputCls} mt-1`} />
                  </label>
                </ActionForm>
              )}
            </div>
          </Panel>

          {acting && (
            <Panel title="Reassign">
              <ActionForm action={reassignLeadAction.bind(null, id)} submitLabel="Reassign" pendingLabel="Reassigning…">
                <label className={labelCls}>
                  Agent
                  <select name="agent" required defaultValue="" className={`${inputCls} mt-1`}>
                    <option value="" disabled>
                      Choose an agent
                    </option>
                    {(agents ?? [])
                      .filter((a) => a.id !== lead.assigned_to)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name || a.email} ({a.role})
                        </option>
                      ))}
                  </select>
                </label>
              </ActionForm>
            </Panel>
          )}

          <Panel title="Alert email">
            {newLeadMail ? (
              <p className="font-body text-body-sm text-ink">
                {newLeadMail.sent_at
                  ? `Sent to you ${fmtDuration(Date.parse(newLeadMail.sent_at) - Date.parse(lead.created_at))} after the lead came in.`
                  : newLeadMail.status === "failed"
                    ? `Couldn't be sent after ${newLeadMail.attempts} tries. The console alert still reached you.`
                    : "Waiting to be sent. Email needs Resend set up on the console."}
              </p>
            ) : (
              <p className={mutedCls}>Alert emails for this lead went to someone else, or it came in before alerts were on.</p>
            )}
          </Panel>
        </div>
      </div>
    </ConsoleShell>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-label text-muted">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
