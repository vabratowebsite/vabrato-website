import Link from "next/link";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { NewPresentationForm } from "@/components/kit-editor";
import { mutedCls } from "@/components/ui";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { DRAFT_STATUS_LABEL } from "@/lib/draft-kinds";
import { KIND_TITLE, type KitKind } from "@/lib/kit-parts";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Listing and buyer presentations (S6b PR 5): written by the assistant with
// the agent's profile and Vabrato's timeline, edited and approved by the
// agent, then printed. Each person sees their own.
export const dynamic = "force-dynamic";

export default async function PresentationsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const ai = await aiFeaturesOn(supabase, ["ai_staff_presentations"]);
  if (!ai.ai_staff_presentations) {
    return (
      <ConsoleShell profile={profile} current="presentations" eyebrow="Reports" title="Presentations">
        <Panel title="Presentations are off">
          <p className={mutedCls}>
            The assistant&apos;s presentations are switched off. An admin can turn them on from the{" "}
            <Link href="/assistant" className="text-navy underline">
              Assistant
            </Link>{" "}
            page once it&apos;s set up.
          </p>
        </Panel>
      </ConsoleShell>
    );
  }
  // CMAs the agent may attach (S6b PR 6): their own, with an approved summary, while CMAs are on.
  const { data: cmaFlag } = await supabase.from("feature_flags").select("enabled").eq("key", "cma_enabled").maybeSingle();
  const { data: summaries } = cmaFlag?.enabled ? await supabase.from("ai_drafts").select("cma_id").eq("kind", "cma_writeup").eq("owner_id", profile.id).eq("status", "approved") : { data: [] };
  const cmaIds = [...new Set((summaries ?? []).map((w) => w.cma_id).filter((x): x is string => Boolean(x)))];
  const { data: attachable } = cmaIds.length ? await supabase.from("cmas").select("id, title").in("id", cmaIds).eq("created_by", profile.id).order("updated_at", { ascending: false }) : { data: [] };
  const { data: mine } = await supabase
    .from("ai_drafts")
    .select("id, kind, subject, status, updated_at")
    .eq("owner_id", profile.id)
    .in("kind", ["listing_presentation", "buyer_presentation"])
    .in("status", ["draft", "approved"])
    .order("updated_at", { ascending: false })
    .limit(30);

  return (
    <ConsoleShell profile={profile} current="presentations" eyebrow="Reports" title="Presentations">
      <Panel title="New presentation">
        <p className={`${mutedCls} mb-4`}>
          The assistant writes the pages; your profile, Vabrato&apos;s services and the usual timeline are added from our records. You edit and approve it, then print it or save it as a PDF. It never includes pricing: use a CMA for that.
        </p>
        <NewPresentationForm cmas={attachable ?? []} />
      </Panel>
      <Panel title="Your presentations">
        {mine?.length ? (
          <ul className="divide-y divide-line">
            {mine.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 font-body text-body-sm text-ink">
                <Pill tone={p.status === "approved" ? "green" : "outline"}>{DRAFT_STATUS_LABEL[p.status] ?? p.status}</Pill>
                <Link href={`/presentations/${p.id}`} className="min-w-0 flex-1 text-navy underline">
                  {p.subject || KIND_TITLE[p.kind as KitKind]}
                </Link>
                <span className="text-muted">
                  {KIND_TITLE[p.kind as KitKind]} · {fmtWhen(p.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>None yet.</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
