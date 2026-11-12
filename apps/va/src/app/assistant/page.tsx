import { Panel, Pill } from "@vabrato/ui/web";
import type { AiMonthSummary, AiUsageToday } from "@vabrato/db";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { WorkQuestionPanel } from "@/components/summary-panels";
import { inputCls, labelCls, linkAction, mutedCls } from "@/components/ui";
import { aiKeyConfigured } from "@/lib/ai";
import { ASSISTANT_FEATURES, MASTER_FLAG, budgetPercent, usd } from "@/lib/assistant";
import { DRAFT_KINDS, DRAFT_STATUS_LABEL, SENT_VIA_LABEL } from "@/lib/draft-kinds";
import { confirmZdrAction, setAiFlagAction, setAiLimitsAction } from "@/lib/assistant-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";
import type { AiDraftKind } from "@vabrato/db";

// The VA assistant (S6b): what it can do and whether it's on, for all staff;
// the switches, limits and this month's spend, for admins. Every change goes
// through the 0026/0027 database functions (admin only, audited).
export const dynamic = "force-dynamic";

const dt = "text-label uppercase tracking-label text-muted";

export default async function AssistantPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const isAdmin = profile.role === "admin";
  const supabase = await supabaseServer();
  const keys = [MASTER_FLAG, ...ASSISTANT_FEATURES.map((f) => f.flag)];
  const [{ data: flagRows }, { data: usageRaw }, { data: s }, { data: monthRaw }, { data: myDrafts }] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled").in("key", keys),
    supabase.rpc("ai_usage_today"),
    supabase
      .from("app_settings")
      .select("ai_daily_requests_staff, ai_daily_requests_member, ai_daily_tokens_staff, ai_daily_tokens_member, ai_monthly_budget_usd, ai_zdr_confirmed_at, ai_zdr_confirmed_by, ai_zdr_note")
      .maybeSingle(),
    isAdmin ? supabase.rpc("ai_month_summary") : Promise.resolve({ data: null }),
    supabase
      .from("ai_drafts")
      .select("id, kind, subject, status, sent_via, updated_at, lead_id, deal_id, leads(name, email), deals(address)")
      .eq("owner_id", profile.id)
      .in("status", ["draft", "approved"])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  const on = (key: string) => Boolean((flagRows ?? []).find((f) => f.key === key)?.enabled);
  const usage = usageRaw as unknown as AiUsageToday | null;
  const month = monthRaw as unknown as AiMonthSummary | null;
  const master = on(MASTER_FLAG);
  const zdr = Boolean(s?.ai_zdr_confirmed_at);
  const keySet = aiKeyConfigured();
  const { data: confirmer } = isAdmin && s?.ai_zdr_confirmed_by ? await supabase.from("profiles").select("full_name, email").eq("id", s.ai_zdr_confirmed_by).maybeSingle() : { data: null };
  const featureName = (key: string) => ASSISTANT_FEATURES.find((f) => f.flag === `ai_${key}`)?.name ?? key;
  const percent = month ? budgetPercent(month.spent_micros, month.budget_usd) : 0;

  return (
    <ConsoleShell profile={profile} current="assistant" eyebrow="Staff" title="Assistant">
      <Panel title="Status">
        <p role="status" className="flex flex-wrap items-center gap-2 font-body text-body-sm font-medium text-ink">
          <Pill tone={master ? "green" : "neutral"}>{master ? "On" : "Off"}</Pill>
          {master ? "The assistant is on for staff. Each feature below has its own switch." : "The assistant is off. An admin turns it on here once Anthropic's Zero Data Retention confirmation and the API key are in place."}
        </p>
        {usage && (
          <p className="mt-3 font-body text-body-sm text-ink">
            Your use today: {usage.requests} of {usage.requests_limit} requests. The count resets at midnight Pacific time.
          </p>
        )}
        <ul className={`${mutedCls} mt-4 list-disc space-y-1 pl-5`}>
          <li>The assistant reads and drafts. It never sends, saves or changes anything by itself: you check its work and you decide.</li>
          <li>Deadlines always come from the schedule engine and the dates you confirm, never from the assistant.</li>
          <li>It doesn&apos;t give legal, tax or lending advice, and it never gives or checks bank or wiring details. Call escrow to verify wiring.</li>
        </ul>
      </Panel>

      <Panel title="What it can do">
        <ul className="divide-y divide-line">
          {ASSISTANT_FEATURES.map((f) => {
            const live = master && on(f.flag);
            return (
              <li key={f.flag} className="py-4 first:pt-0 last:pb-0">
                <h3 className="flex flex-wrap items-center gap-2 font-body text-body-md font-medium text-ink">
                  {f.name}
                  <Pill tone={live ? "green" : "neutral"}>{live ? "On" : "Off"}</Pill>
                </h3>
                <p className="mt-1 font-body text-body-sm text-ink">{f.what}</p>
                {live && (
                  <a href={f.where.href} className={`${linkAction} -ml-2`}>
                    Use it in {f.where.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        <p className={`${mutedCls} mt-4`}>Drafts are yours until you approve them; discarded drafts, and drafts left untouched, are deleted after 30 days. More is on the way: listing launch kits, market updates and document checks.</p>
      </Panel>

      {master && on("ai_staff_data_questions") && (
        <Panel title="Ask about your work">
          <WorkQuestionPanel />
        </Panel>
      )}

      {(myDrafts?.length ?? 0) > 0 && (
        <Panel title="My drafts">
          <p className={`${mutedCls} mb-3`}>Your open drafts and the ones you approved recently. Drafts you don&apos;t approve or discard are deleted 30 days after you last changed them.</p>
          <ul className="divide-y divide-line">
            {(myDrafts ?? []).map((d) => {
              const about = d.lead_id ? (d.leads?.name || d.leads?.email || "Lead") : (d.deals?.address ?? "Transaction");
              const href = d.lead_id ? `/leads/${d.lead_id}` : `/deals/${d.deal_id}`;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 font-body text-body-sm text-ink">
                  <Pill tone={d.status === "approved" ? "green" : "outline"}>{DRAFT_STATUS_LABEL[d.status] ?? d.status}</Pill>
                  <span className="min-w-0 flex-1">
                    <a href={href} className="text-navy underline">
                      {d.subject || DRAFT_KINDS[d.kind as AiDraftKind]?.one || "Draft"}
                    </a>
                    <span className="text-muted">
                      {" "}
                      · {DRAFT_KINDS[d.kind as AiDraftKind]?.one} for {about} · {fmtWhen(d.updated_at)}
                      {d.sent_via ? ` · ${SENT_VIA_LABEL[d.sent_via] ?? d.sent_via}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {isAdmin && (
        <Panel title="Before turning it on">
          <dl className="grid gap-5 font-body text-body-sm text-ink sm:grid-cols-2">
            <div>
              <dt className={dt}>Zero Data Retention</dt>
              <dd className="mt-1 space-y-1">
                <Pill tone={zdr ? "green" : "red"}>{zdr ? "Confirmed" : "Not confirmed"}</Pill>
                <p>
                  {zdr
                    ? `Recorded ${fmtWhen(s?.ai_zdr_confirmed_at ?? null)}${confirmer ? ` by ${confirmer.full_name || confirmer.email}` : ""}: ${s?.ai_zdr_note ?? ""}`
                    : "Anthropic must confirm in writing that our API account has Zero Data Retention, so contracts and client details aren't kept after a request. The assistant can't be turned on until that is recorded here."}
                </p>
              </dd>
            </div>
            <div>
              <dt className={dt}>API key</dt>
              <dd className="mt-1 space-y-1">
                <Pill tone={keySet ? "green" : "red"}>{keySet ? "Set" : "Not set"}</Pill>
                <p>{keySet ? "The console has an Anthropic API key." : "Add ANTHROPIC_API_KEY to the console's project in Vercel (never in chat or in the code), then redeploy."}</p>
              </dd>
            </div>
          </dl>
          <ActionForm action={confirmZdrAction} submitLabel={zdr ? "Update the record" : "Record the confirmation"} secondary={zdr} className="mt-6 space-y-4 border-t border-line pt-5">
            <label className={labelCls}>
              Where the written confirmation is filed
              <input name="note" required minLength={10} maxLength={300} placeholder="Email from Anthropic, the date, who has it" className={`${inputCls} mt-1`} />
            </label>
            <label className="flex min-h-[44px] items-center gap-3 font-body text-body-sm text-ink">
              <input type="checkbox" name="confirm" required className="h-5 w-5 accent-navy" />
              We have Anthropic&apos;s confirmation of Zero Data Retention for this API account in writing.
            </label>
          </ActionForm>
        </Panel>
      )}

      {isAdmin && (
        <Panel title="Switches">
          <ul className="divide-y divide-line">
            {[{ flag: MASTER_FLAG, name: "The assistant (master switch)", what: "Off stops every assistant feature for everyone at once." }, ...ASSISTANT_FEATURES].map((f) => {
              const enabled = on(f.flag);
              return (
                <li key={f.flag} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-body text-body-sm font-medium text-ink">
                      {f.name}
                      <Pill tone={enabled ? "green" : "neutral"}>{enabled ? "On" : "Off"}</Pill>
                    </p>
                    <p className={mutedCls}>{f.flag === MASTER_FLAG ? f.what : "Runs only while the master switch is also on."}</p>
                  </div>
                  <ActionForm action={setAiFlagAction} submitLabel={enabled ? "Turn off" : "Turn on"} submitAriaLabel={`${enabled ? "Turn off" : "Turn on"}: ${f.name}`} secondary={enabled}>
                    <input type="hidden" name="key" value={f.flag} />
                    <input type="hidden" name="on" value={enabled ? "false" : "true"} />
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {isAdmin && month && (
        <Panel title="This month">
          <p className="font-body text-body-sm text-ink">
            <strong>{usd(month.spent_micros)}</strong> of the ${month.budget_usd} budget used ({percent}%), across {month.requests} {month.requests === 1 ? "request" : "requests"}. Admins get an alert at 80%; at 100% the assistant pauses until the
            budget is raised or the month ends.
          </p>
          <progress className="mt-3 block h-2 w-full max-w-md accent-navy" max={100} value={percent} aria-label={`Share of this month's budget used: ${percent}%`} />
          {month.by_feature.length > 0 && (
            <div className="mt-5 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="This month's use by feature">
              <table className="w-full min-w-[480px] font-body text-body-sm text-ink">
                <thead>
                  <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Feature</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Requests</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Blocked or failed</th>
                    <th scope="col" className="py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {month.by_feature.map((f) => (
                    <tr key={f.feature} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">{featureName(f.feature)}</th>
                      <td className="py-2 pr-4">{f.requests}</td>
                      <td className="py-2 pr-4">{f.not_ok}</td>
                      <td className="py-2">{usd(f.cost_micros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={`${mutedCls} mt-4`}>The log holds who, which feature, size, cost and how it ended. It never holds the request, the documents or the answer.</p>
        </Panel>
      )}

      {isAdmin && s && (
        <Panel title="Limits">
          <ActionForm action={setAiLimitsAction} submitLabel="Save limits" className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Monthly budget for everyone ($)
              <input name="budget" type="number" min={0} max={100000} required defaultValue={s.ai_monthly_budget_usd} className={`${inputCls} mt-1`} />
            </label>
            <span className="hidden sm:block" />
            <label className={labelCls}>
              Staff: requests a day, each person
              <input name="requests_staff" type="number" min={0} max={10000} required defaultValue={s.ai_daily_requests_staff} className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              Staff: tokens a day, each person
              <input name="tokens_staff" type="number" min={0} max={100000000} step={1000} required defaultValue={s.ai_daily_tokens_staff} className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              Members: requests a day, each person
              <input name="requests_member" type="number" min={0} max={10000} required defaultValue={s.ai_daily_requests_member} className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              Members: tokens a day, each person
              <input name="tokens_member" type="number" min={0} max={100000000} step={1000} required defaultValue={s.ai_daily_tokens_member} className={`${inputCls} mt-1`} />
            </label>
            <p className={`${mutedCls} sm:col-span-2`}>A token is about three-quarters of a word. A 30-page contract is roughly 60,000 to 100,000 tokens. Member limits apply once the client assistant ships.</p>
          </ActionForm>
        </Panel>
      )}
    </ConsoleShell>
  );
}
