import Link from "next/link";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, btnSecondary, inputCls, labelCls, mutedCls } from "@/components/ui";
import { handleDeletionAction } from "@/lib/member-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Account deletion queue (S5 review item 14). Admins and the acting lead
// admin see it (RLS). Deleting the account itself is done in Supabase Auth;
// this records that it was handled, by whom, with a note.
export const dynamic = "force-dynamic";

export default async function DeletionQueue() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const { data: requests } = await supabase.from("account_deletion_requests").select("id, profile_id, status, requested_at, handled_at, note").order("requested_at", { ascending: false }).limit(100);
  const ids = [...new Set((requests ?? []).map((r) => r.profile_id).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const done = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <ConsoleShell profile={profile} current="members" eyebrow="Members" title="Deletion requests">
      <p className={mutedCls}>
        Delete the person&apos;s login in Supabase Auth and their portal data within 45 days, then mark the request done here. Transaction files the law requires us to keep stay.
      </p>
      <Panel title={`Waiting (${pending.length})`}>
        {pending.length ? (
          <ul className="space-y-6">
            {pending.map((r) => (
              <li key={r.id} className="border border-line p-4">
                <p className="font-body text-body-sm text-ink">
                  {r.profile_id ? (
                    <Link href={`/members/${r.profile_id}`} className="font-medium text-navy underline">
                      {who.get(r.profile_id) ?? "Member"}
                    </Link>
                  ) : (
                    "Deleted account"
                  )}{" "}
                  · asked {fmtWhen(r.requested_at)}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form action={handleDeletionAction.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="status" value="completed" />
                    <label className={labelCls}>
                      Note (optional)
                      <input name="note" maxLength={1000} className={`${inputCls} mt-1 w-72 max-w-full`} />
                    </label>
                    <button type="submit" className={btnPrimary}>
                      Mark done
                    </button>
                  </form>
                  <form action={handleDeletionAction.bind(null, r.id)}>
                    <input type="hidden" name="status" value="cancelled" />
                    <button type="submit" className={btnSecondary}>
                      Cancel request
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>Nothing waiting{requests ? "" : ", or you can't see the queue (admins and the lead admin can)"}.</p>
        )}
      </Panel>
      {done.length > 0 && (
        <Panel title="Handled">
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {done.map((r) => (
              <li key={r.id} className="py-2">
                {(r.profile_id && who.get(r.profile_id)) || "Deleted account"} · {r.status} {r.handled_at ? fmtWhen(r.handled_at) : ""}
                {r.note && <span className="block text-caption text-muted">{r.note}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </ConsoleShell>
  );
}
