import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { PartsEditor } from "@/components/kit-editor";
import { KIND_TITLE, cleanParts, type KitKind } from "@/lib/kit-parts";
import type { KitView } from "@/lib/kit-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// One presentation: edit and approve, then print (S6b PR 5).
export const dynamic = "force-dynamic";

export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from("ai_drafts").select("id, kind, status, content, sent_via, subject").eq("id", id).in("kind", ["listing_presentation", "buyer_presentation"]).maybeSingle();
  if (!p || p.status === "discarded") notFound();
  const kind = p.kind as KitKind;
  const view: KitView = { id: p.id, kind, status: p.status as KitView["status"], parts: cleanParts(kind, p.content), sent_via: p.sent_via };

  return (
    <ConsoleShell profile={profile} current="presentations" eyebrow={KIND_TITLE[kind]} title={p.subject || KIND_TITLE[kind]}>
      <Link href="/presentations" className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
        ← Presentations
      </Link>
      <Panel title="Pages written by the assistant">
        <PartsEditor initial={view} printHref={`/presentations/${p.id}/print`} />
      </Panel>
    </ConsoleShell>
  );
}
