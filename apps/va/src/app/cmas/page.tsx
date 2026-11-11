import Link from "next/link";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, mutedCls, okCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// CMAs (S6 PR 5): comparable sold listings for verified agents. Off until
// MLSListings confirms sold data in writing (cma_enabled).
export const dynamic = "force-dynamic";

export default async function CmasPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { done } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: flag }, { data: verified }, { data: cmas }] = await Promise.all([
    supabase.from("feature_flags").select("enabled").eq("key", "cma_enabled").maybeSingle(),
    supabase.rpc("has_verified_mls_access"),
    supabase.from("cmas").select("id, title, comp_keys, created_by, updated_at").order("updated_at", { ascending: false }).limit(100),
  ]);
  const on = Boolean(flag?.enabled);
  const canCreate = on && Boolean(verified);

  return (
    <ConsoleShell
      profile={profile}
      current="cmas"
      eyebrow="Reports"
      title="CMAs"
      topRight={
        canCreate ? (
          <Link href="/cmas/new" className={btnPrimary}>
            New CMA
          </Link>
        ) : undefined
      }
    >
      {done === "deleted" && (
        <p role="status" className={okCls}>
          CMA deleted.
        </p>
      )}
      {!on ? (
        <Panel title="Off for now">
          <p className="font-body text-body-sm text-ink">
            CMAs use sold listings. They stay off until MLSListings confirms in writing that we may use sold data (the <code>cma_enabled</code> flag). Everything is built and tested on fictional data.
          </p>
        </Panel>
      ) : !verified ? (
        <Panel title="MLS membership not verified">
          <p className="font-body text-body-sm text-ink">CMAs are for agents verified as active MLSListings members of our office. Your status is checked each time you sign in; see Settings.</p>
        </Panel>
      ) : null}
      <Panel title="Saved CMAs">
        {cmas?.length ? (
          <ul className="divide-y divide-line">
            {cmas.map((c) => (
              <li key={c.id} className="py-2 font-body text-body-sm text-ink">
                <Link href={`/cmas/${c.id}`} className="font-medium text-navy underline">
                  {c.title}
                </Link>
                <span className="block text-caption text-muted">
                  {c.comp_keys.length} comparable{c.comp_keys.length === 1 ? "" : "s"} · updated {fmtWhen(c.updated_at)}
                  {c.created_by !== profile.id ? " · another agent's" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>No CMAs yet.</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
