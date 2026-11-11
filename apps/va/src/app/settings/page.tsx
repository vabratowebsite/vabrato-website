import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { inputCls, labelCls, mutedCls } from "@/components/ui";
import { setAwayAction, setRoutingAction, setSyncLiveAction } from "@/lib/lead-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";
import { AwayFields } from "./away-fields";

// Lead routing (SPEC <lead_routing>): who gets new leads, the backup while
// the lead admin is away, escalation and the hourly email cap. Mark, Viv
// while Mark is away, or any role admin can change it (0022
// can_manage_settings); everyone else sees it read-only.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const [{ data: s }, { data: canManage }, { data: away }, { data: people }, { data: access }, { data: full }] = await Promise.all([
    supabase.from("app_settings").select("lead_admin_id, backup_admin_id, lead_admin_away, lead_admin_away_until, lead_escalation_minutes, lead_flood_cap, mls_sync_live").maybeSingle(),
    supabase.rpc("can_manage_settings"),
    supabase.rpc("lead_admin_away_now"),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["admin", "agent"]).order("full_name"),
    supabase.from("mls_agent_access").select("active, verified_at, member_key").eq("profile_id", profile.id).maybeSingle(),
    supabase.rpc("has_full_mls_access"),
  ]);
  const name = (id: string | null | undefined) => (id ? ((people ?? []).find((p) => p.id === id)?.full_name || (people ?? []).find((p) => p.id === id)?.email || "Staff") : "Not set");
  const options = (people ?? []).map((p) => (
    <option key={p.id} value={p.id}>
      {p.full_name || p.email} ({p.role})
    </option>
  ));

  return (
    <ConsoleShell profile={profile} current="settings" eyebrow="Account" title="Settings">
      <Panel title="Your MLS access">
        <p className="font-body text-body-sm text-ink">
          {access?.active
            ? `Verified as an active MLSListings member of our office on ${fmtWhen(access.verified_at)}. Re-checked at every sign-in and nightly.`
            : access
              ? "Not active: the last check didn't find you as an active member of our office. Sign out and back in after MLSListings updates your record."
              : "Not checked yet. It's checked when you sign in, once the console knows our MLS office ID."}
        </p>
        <p className={`${mutedCls} mt-2`}>{full ? "You can see FULL MLS fields in the console." : "FULL MLS fields are off for everyone until MLSListings confirms FULL access in writing; you see IDX data."}</p>
      </Panel>

      <Panel title="Lead routing">
        <dl className="mb-6 grid gap-4 font-body text-body-sm text-ink sm:grid-cols-2">
          <div>
            <dt className="text-label uppercase tracking-label text-muted">New leads go to</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              {s?.lead_admin_id || s?.backup_admin_id ? name(away ? (s?.backup_admin_id ?? s?.lead_admin_id) : (s?.lead_admin_id ?? s?.backup_admin_id)) : <Pill tone="red">Routing isn&apos;t set up</Pill>}
              {away && <Pill tone="gold">Lead admin away{s?.lead_admin_away_until ? ` until ${fmtWhen(s.lead_admin_away_until)}` : ""}</Pill>}
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-label text-muted">Escalation and email cap</dt>
            <dd className="mt-1">
              No reply after {s?.lead_escalation_minutes ?? 120} min goes to the backup; over {s?.lead_flood_cap ?? 10} lead emails an hour become a 15-minute digest.
            </dd>
          </div>
        </dl>

        {canManage ? (
          <ActionForm action={setRoutingAction} submitLabel="Save routing" className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Lead admin (gets every lead)
              <select name="lead" defaultValue={s?.lead_admin_id ?? ""} className={`${inputCls} mt-1`}>
                <option value="">Not set</option>
                {options}
              </select>
            </label>
            <label className={labelCls}>
              Backup (while the lead admin is away)
              <select name="backup" defaultValue={s?.backup_admin_id ?? ""} className={`${inputCls} mt-1`}>
                <option value="">Not set</option>
                {options}
              </select>
            </label>
            <label className={labelCls}>
              Escalate unanswered leads after (minutes)
              <input name="escalation" type="number" min={15} max={1440} required defaultValue={s?.lead_escalation_minutes ?? 120} className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              Lead emails per hour before a digest
              <input name="flood" type="number" min={1} max={1000} required defaultValue={s?.lead_flood_cap ?? 10} className={`${inputCls} mt-1`} />
            </label>
          </ActionForm>
        ) : (
          <p className={mutedCls}>Only the lead admin, the backup while the lead admin is away, or an admin can change routing.</p>
        )}
      </Panel>

      {canManage && (
        <Panel title="MLS feed alerts">
          <p role="status" className="mb-4 font-body text-body-sm font-medium text-ink">
            {s?.mls_sync_live ? "On: a failed or late sync alerts admins and the lead admin." : "Off: the feed isn't live yet, so failures don't alert anyone."}
          </p>
          <ActionForm action={setSyncLiveAction} submitLabel={s?.mls_sync_live ? "Turn feed alerts off" : "Turn feed alerts on (feed is live)"} secondary={Boolean(s?.mls_sync_live)}>
            <input type="hidden" name="live" value={s?.mls_sync_live ? "false" : "true"} />
          </ActionForm>
        </Panel>
      )}

      {canManage && (
        <Panel title="Away">
          <p className={`${mutedCls} mb-2`}>While the lead admin is away, new leads, escalations and the deletion queue go to the backup.</p>
          <p role="status" className="mb-4 font-body text-body-sm font-medium text-ink">
            {away ? `Away is on${s?.lead_admin_away_until ? ` until ${fmtWhen(s.lead_admin_away_until)}` : ""}: new leads go to the backup.` : "Away is off: new leads go to the lead admin."}
          </p>
          <ActionForm action={setAwayAction} submitLabel={away ? "Update away" : "Turn away on"} className="space-y-4">
            <AwayFields away={Boolean(away)} />
          </ActionForm>
          {away && (
            <ActionForm action={setAwayAction} submitLabel="Turn away off" secondary className="mt-4">
              <input type="hidden" name="away" value="false" />
            </ActionForm>
          )}
        </Panel>
      )}
    </ConsoleShell>
  );
}
