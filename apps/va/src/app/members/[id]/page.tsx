import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { MemberSummaryPanel } from "@/components/summary-panels";
import { inputCls, labelCls, mutedCls } from "@/components/ui";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { decideMemberTodoAction, setMemberAgentAction } from "@/lib/member-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen, leadKindLabel } from "@/lib/today";

// One member: account, agent, saved homes and searches, homes they're
// pursuing, tours, documents and deals. Read-only except the agent (acting
// lead admin). RLS: only members this person may see; others get a 404.
export const dynamic = "force-dynamic";

const SITE = (process.env.PUBLIC_SITE_URL ?? "https://vabrato.com").replace(/\/+$/, "");
const ROLE_LABEL: Record<string, string> = { buyer: "Buying", seller: "Selling", both: "Buying and selling" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: m } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, agent_id, created_at, onboarded_at, alerts_email_opt_in, vow_accepted_at, buyer_agreement_on_file_at")
    .eq("id", id)
    .in("role", ["buyer", "seller", "both"])
    .maybeSingle();
  if (!m) notFound();

  const ai = await aiFeaturesOn(supabase, ["ai_staff_member_summary"]);
  const [saved, searches, tracked, tours, docs, deals, deletion, agents, acting, todos] = await Promise.all([
    supabase.from("saved_homes").select("listing_key, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("saved_searches").select("id, name, frequency").eq("profile_id", id).order("created_at", { ascending: false }),
    supabase.from("tracked_properties").select("id, address, status").eq("buyer_id", id).order("created_at", { ascending: false }),
    supabase.from("leads").select("id, listing_key, tour_status, created_at, kind").eq("profile_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("member_documents").select("id, name, created_at").eq("profile_id", id).order("created_at", { ascending: false }),
    supabase.from("deal_members").select("deal_id, member_role, deals(address, status)").eq("profile_id", id),
    supabase.from("account_deletion_requests").select("status, requested_at").eq("profile_id", id).order("requested_at", { ascending: false }).limit(1),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["admin", "agent"]).order("full_name"),
    supabase.rpc("is_acting_lead_admin"),
    supabase.from("member_todos").select("id, title, source_name, page, status, created_at").eq("profile_id", id).order("created_at", { ascending: true }).limit(300),
  ]);
  const pendingTodos = (todos.data ?? []).filter((t) => t.status === "pending");
  const todoCount = (s: string) => (todos.data ?? []).filter((t) => t.status === s).length;
  const agentName = (aid: string | null) => (aid ? (aid === profile.id ? "You" : (agents.data ?? []).find((a) => a.id === aid)?.full_name || "Staff") : "None");

  return (
    <ConsoleShell profile={profile} current="members" eyebrow={`Member · ${ROLE_LABEL[m.role] ?? m.role}`} title={m.full_name || m.email}>
      <Link href="/members" className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
        ← All members
      </Link>
      {deletion.data?.[0]?.status === "pending" && (
        <p role="note" className="border border-red/40 bg-red-50 px-4 py-3 font-body text-body-sm text-red">
          This member asked to delete their account on {fmtWhen(deletion.data[0].requested_at)}. <Link href="/members/deletions" className="underline">Deletion queue</Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {ai.ai_staff_member_summary && (
            <Panel title="Assistant">
              <MemberSummaryPanel memberId={id} />
            </Panel>
          )}
          <Panel title="Account">
            <dl className="grid gap-4 font-body text-body-sm text-ink sm:grid-cols-2">
              <Item label="Email">
                <a href={`mailto:${m.email}`} className="break-all text-navy underline">
                  {m.email}
                </a>
              </Item>
              <Item label="Phone">{m.phone ? <a href={`tel:${m.phone.replace(/[^0-9+]/g, "")}`} className="text-navy underline">{m.phone}</a> : "Not given"}</Item>
              <Item label="Joined">{fmtWhen(m.created_at)}{m.onboarded_at ? "" : " (setup not finished)"}</Item>
              <Item label="Alert emails">{m.alerts_email_opt_in ? "On" : "Off"}</Item>
              <Item label="Sold-data terms (VOW)">{m.vow_accepted_at ? `Accepted ${fmtWhen(m.vow_accepted_at)}` : "Not accepted"}</Item>
              <Item label="Buyer agreement">{m.buyer_agreement_on_file_at ? `On file since ${fmtWhen(m.buyer_agreement_on_file_at)}` : "Not on file"}</Item>
            </dl>
            <p className={`${mutedCls} mt-4`}>
              <Link href={`/messages/${m.id}`} className="text-navy underline">
                Messages
              </Link>{" "}
              (also where you record the buyer agreement and confirm tours)
            </p>
          </Panel>

          <Panel title={`Saved homes (${saved.data?.length ?? 0})`}>
            {saved.data?.length ? (
              <ul className="flex flex-wrap gap-2 font-body text-body-sm">
                {saved.data.map((s) => (
                  <li key={s.listing_key}>
                    <a href={`${SITE}/listing/${s.listing_key}/x`} className="text-navy underline">
                      {s.listing_key}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={mutedCls}>None.</p>
            )}
          </Panel>

          <Panel title="Saved searches">
            {searches.data?.length ? (
              <ul className="divide-y divide-line font-body text-body-sm text-ink">
                {searches.data.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{s.name}</span>
                    <Pill tone={s.frequency === "off" ? "outline" : "navy"}>{s.frequency === "instant" ? "Instant alerts" : s.frequency === "daily" ? "Daily digest" : "Alerts off"}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={mutedCls}>None.</p>
            )}
          </Panel>

          <Panel title="Homes they're pursuing">
            {tracked.data?.length ? (
              <ul className="divide-y divide-line font-body text-body-sm text-ink">
                {tracked.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{p.address}</span>
                    <Pill tone="neutral">{p.status.replace(/_/g, " ")}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={mutedCls}>None.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Agent">
            <p className="mb-4 font-body text-body-sm text-ink">Assigned: {agentName(m.agent_id)}</p>
            {acting.data ? (
              <ActionForm action={setMemberAgentAction.bind(null, m.id)} submitLabel="Change agent">
                <label className={labelCls}>
                  Agent
                  <select name="agent" defaultValue={m.agent_id ?? ""} className={`${inputCls} mt-1`}>
                    <option value="">None</option>
                    {(agents.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name || a.email} ({a.role})
                      </option>
                    ))}
                  </select>
                </label>
              </ActionForm>
            ) : (
              <p className={mutedCls}>Mark (or Viv while Mark is away) assigns agents.</p>
            )}
          </Panel>

          {(todos.data?.length ?? 0) > 0 && (
            <Panel title="Suggested to-dos">
              <p className={`${mutedCls} mb-3`}>
                From the member&apos;s assistant (Ask Vabrato). The member added these; approving puts them on their to-do list in the portal. {todoCount("approved")} approved, {todoCount("declined")} declined so far.
              </p>
              {pendingTodos.length ? (
                <ul className="divide-y divide-line font-body text-body-sm text-ink">
                  {pendingTodos.map((t) => (
                    <li key={t.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="flex flex-wrap items-center gap-2">
                          {t.title}
                          <Pill tone="gold">Waiting</Pill>
                        </p>
                        <p className={mutedCls}>
                          {t.source_name ? `From ${t.source_name}${t.page ? `, p. ${t.page}` : ""} · ` : ""}added {fmtWhen(t.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={decideMemberTodoAction.bind(null, m.id)} submitLabel="Approve" submitAriaLabel={`Approve: ${t.title}`}>
                          <input type="hidden" name="todo" value={t.id} />
                          <input type="hidden" name="decision" value="approve" />
                        </ActionForm>
                        <ActionForm action={decideMemberTodoAction.bind(null, m.id)} submitLabel="Decline" submitAriaLabel={`Decline: ${t.title}`} secondary>
                          <input type="hidden" name="todo" value={t.id} />
                          <input type="hidden" name="decision" value="decline" />
                        </ActionForm>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={mutedCls}>Nothing waiting.</p>
              )}
            </Panel>
          )}

          <Panel title="Requests from this member">
            {tours.data?.length ? (
              <ul className="divide-y divide-line font-body text-body-sm text-ink">
                {tours.data.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link href={`/leads/${t.id}`} className="text-navy underline">
                      {leadKindLabel(t.kind)}
                      {t.listing_key ? ` · ${t.listing_key}` : ""}
                    </Link>
                    <span className="block text-caption text-muted">
                      {fmtWhen(t.created_at)}
                      {t.tour_status ? ` · ${t.tour_status}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={mutedCls}>None you can see. Leads are visible to their owner and the lead admin.</p>
            )}
          </Panel>

          <Panel title="Documents">
            {docs.data?.length ? (
              <ul className="divide-y divide-line font-body text-body-sm text-ink">
                {docs.data.map((d) => (
                  <li key={d.id} className="py-2">
                    {d.name}
                    <span className="block text-caption text-muted">{fmtWhen(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={mutedCls}>None.</p>
            )}
          </Panel>

          <Panel title="Deals">
            {deals.data?.length ? (
              <ul className="divide-y divide-line font-body text-body-sm">
                {deals.data.map((d) => {
                  const deal = d.deals as unknown as { address: string; status: string } | null;
                  return (
                    <li key={d.deal_id} className="py-2">
                      <Link href={`/deals/${d.deal_id}`} className="text-navy underline">
                        {deal?.address ?? "Deal"}
                      </Link>
                      <span className="block text-caption text-muted">
                        {d.member_role} · {deal?.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={mutedCls}>None.</p>
            )}
          </Panel>
        </div>
      </div>
    </ConsoleShell>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
