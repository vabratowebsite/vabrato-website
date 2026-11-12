import type { AiDraftKind } from "@vabrato/db";
import type { SupabaseDb } from "@vabrato/lib";
import type { DraftView } from "./draft-actions";
import { DRAFT_KINDS } from "./draft-kinds";

// What a lead or deal page needs for its AI draft panels (S6b PR 3): which
// draft features are on, the signed-in person's pending draft of each kind, and
// the approved drafts in the file. RLS decides what's visible (0028).

export interface ApprovedDraft {
  id: string;
  kind: AiDraftKind;
  subject: string;
  body: string;
  approved_at: string;
  sent_via: string | null;
  by: string;
}

export interface DraftData {
  on: Record<AiDraftKind, boolean>;
  open: Partial<Record<AiDraftKind, DraftView>>;
  approved: ApprovedDraft[];
}

export async function draftsFor(supabase: SupabaseDb, me: string, where: { lead_id: string } | { deal_id: string }, kinds: AiDraftKind[]): Promise<DraftData> {
  const flags = ["ai_enabled", ...kinds.map((k) => DRAFT_KINDS[k].flag)];
  const [col, value] = "lead_id" in where ? (["lead_id", where.lead_id] as const) : (["deal_id", where.deal_id] as const);
  const [{ data: flagRows }, { data: rows }] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled").in("key", flags),
    supabase.from("ai_drafts").select("id, kind, subject, body, status, sent_via, vendor_id, owner_id, approved_at, updated_at").eq(col, value).in("status", ["draft", "approved"]).order("updated_at", { ascending: false }).limit(50),
  ]);
  const enabled = new Set((flagRows ?? []).filter((f) => f.enabled).map((f) => f.key));
  const master = enabled.has("ai_enabled");
  const on = Object.fromEntries(Object.values(DRAFT_KINDS).map((k) => [k.kind, master && enabled.has(k.flag)])) as Record<AiDraftKind, boolean>;

  const open: DraftData["open"] = {};
  // The person's latest draft of each kind, while it's still being edited or
  // approved but not yet sent, so a reload keeps the send buttons.
  for (const r of rows ?? []) {
    const kind = r.kind as AiDraftKind;
    if (r.owner_id !== me || kind in open) continue;
    const pending = r.status === "draft" || (r.status === "approved" && !r.sent_via);
    open[kind] = pending ? { id: r.id, kind, subject: r.subject, body: r.body, status: r.status as DraftView["status"], sent_via: r.sent_via, vendor_id: r.vendor_id } : undefined;
  }
  for (const k of Object.keys(open) as AiDraftKind[]) if (!open[k]) delete open[k];

  const approvedRows = (rows ?? []).filter((r) => r.status === "approved" && r.approved_at);
  const others = [...new Set(approvedRows.map((r) => r.owner_id).filter((id) => id !== me))];
  const names = new Map<string, string>();
  if (others.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", others);
    for (const p of people ?? []) names.set(p.id, p.full_name || p.email);
  }
  const approved = approvedRows
    .map((r) => ({
      id: r.id,
      kind: r.kind as AiDraftKind,
      subject: r.subject,
      body: r.body,
      approved_at: r.approved_at as string,
      sent_via: r.sent_via,
      by: r.owner_id === me ? "You" : (names.get(r.owner_id) ?? "Staff"),
    }))
    .sort((a, b) => b.approved_at.localeCompare(a.approved_at));
  return { on, open, approved };
}
