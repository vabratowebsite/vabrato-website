import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/print-button";
import { PRINT_CSS } from "@/lib/print";
import type { ResponseContent } from "@/lib/repair-kinds";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// A printable approved response to the buyer's request for repairs (S6b PR
// 7b): exactly the approved text, nothing added.
export const dynamic = "force-dynamic";

export default async function ResponsePrintPage({ params }: { params: Promise<{ id: string; responseId: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id, responseId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(responseId)) notFound();
  const supabase = await supabaseServer();
  const { data: r } = await supabase.from("ai_drafts").select("id, status, subject, body, content").eq("id", responseId).eq("deal_id", id).eq("kind", "repair_response").maybeSingle();
  if (!r || r.status !== "approved") notFound();
  const itemsId = (r.content as unknown as ResponseContent).items_id;

  return (
    <main id="main" className="mx-auto max-w-[8.5in] bg-white p-8 font-body text-ink">
      <style>{PRINT_CSS}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-no-print>
        <a href={`/deals/${id}/repairs/${itemsId}`} className="font-body text-body-sm text-navy underline">
          ← Back to the repair items
        </a>
        <PrintButton />
      </div>
      <h1 className="font-body text-body-lg font-medium">{r.subject}</h1>
      <pre className="mt-4 whitespace-pre-wrap font-body text-body-md">{r.body}</pre>
    </main>
  );
}
