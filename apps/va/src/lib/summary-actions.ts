"use server";

import { z } from "zod";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { prepareNote } from "@/lib/drafts";
import { DAILY_BRIEFING, DATA_QUESTIONS, MEMBER_SUMMARY, memberParts, renderAnswer, renderBriefing } from "@/lib/summaries";
import type { BriefingView, MemberSummaryView, QuestionView, SummaryResult } from "@/lib/summary-views";
import { supabaseServer } from "@/lib/supabase-server";
import { buildSnapshot, loadWork, snapshotParts } from "@/lib/work-snapshot";

// S6b PR 4: the daily briefing, the member activity summary and questions
// about your work. Every read runs as the signed-in staff member (RLS);
// every model call goes through packages/ai; nothing is stored.

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const NO_KEY = "The assistant isn't set up yet: it has no API key. Ask an admin.";

type Result<T> = SummaryResult<T>;

export async function briefingAction(): Promise<Result<BriefingView>> {
  try {
    const { supabase } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const snapshot = buildSnapshot(await loadWork(supabase, today()));
    const result = await runAi(aiDeps(supabase), DAILY_BRIEFING, { parts: snapshotParts(snapshot, "briefing") });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    return { ok: true, view: renderBriefing(result.data, snapshot) };
  } catch (e) {
    console.error("[briefing]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing your briefing. Please try again." };
  }
}

export async function askAboutWorkAction(question: string): Promise<Result<QuestionView>> {
  const q = typeof question === "string" ? question.trim().slice(0, 500) : "";
  if (!q) return { ok: false, error: "Type a question first." };
  const prepared = prepareNote(q);
  if (prepared.error) return { ok: false, error: prepared.error };
  try {
    const { supabase } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const snapshot = buildSnapshot(await loadWork(supabase, today()));
    const result = await runAi(aiDeps(supabase), DATA_QUESTIONS, { instruction: prepared.note, parts: snapshotParts(snapshot, "all") });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    return { ok: true, view: renderAnswer(result.data, snapshot) };
  } catch (e) {
    console.error("[askAboutWork]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong answering. Please try again." };
  }
}

const DAY = 86_400_000;

export async function memberSummaryAction(memberId: string): Promise<Result<MemberSummaryView>> {
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  try {
    const { supabase } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const { data: member } = await supabase.from("profiles").select("id, full_name, created_at, role").eq("id", memberId).maybeSingle();
    if (!member || !["buyer", "seller", "both"].includes(member.role)) return { ok: false, error: "That member isn't one you can see." };
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const [saved, searches, tours, pursuing, messages, msgCount, alertCount] = await Promise.all([
      supabase.from("saved_homes").select("listing_key, created_at").eq("profile_id", memberId).order("created_at", { ascending: false }).limit(20),
      supabase.from("saved_searches").select("name, criteria").eq("profile_id", memberId).order("created_at", { ascending: false }).limit(10),
      supabase.from("leads").select("listing_key, tour_status, created_at").eq("profile_id", memberId).eq("kind", "tour").order("created_at", { ascending: false }).limit(10),
      supabase.from("tracked_properties").select("address, status").eq("buyer_id", memberId).order("created_at", { ascending: false }).limit(10),
      supabase.from("messages").select("sender_id, body, created_at").eq("member_id", memberId).order("created_at", { ascending: false }).limit(10),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("member_id", memberId).gte("created_at", since),
      supabase.from("alert_deliveries").select("id", { count: "exact", head: true }).eq("profile_id", memberId).gte("created_at", since),
    ]);
    const keys = [...new Set([...(saved.data ?? []).map((s) => s.listing_key), ...(tours.data ?? []).map((t) => t.listing_key).filter((k): k is string => Boolean(k))])];
    const { data: listings } = keys.length ? await supabase.from("mls_listings").select("listing_key, data").in("listing_key", keys) : { data: [] };
    const byKey = new Map((listings ?? []).map((l) => [l.listing_key, l.data as Record<string, unknown>]));

    const parts = memberParts({
      today: today(),
      name: member.full_name,
      memberSince: member.created_at,
      savedHomes: (saved.data ?? []).map((s) => ({ saved_at: s.created_at, listing: byKey.get(s.listing_key) ?? null })),
      searches: searches.data ?? [],
      tours: (tours.data ?? []).map((t) => ({ requested_at: t.created_at, status: t.tour_status, city: (t.listing_key && (byKey.get(t.listing_key)?.City as string | undefined)) || null })),
      pursuing: pursuing.data ?? [],
      messages: (messages.data ?? []).map((m) => ({ from: m.sender_id === memberId ? "member" : "staff", at: m.created_at, body: m.body })),
      messageCount30: msgCount.count ?? 0,
      alertCount30: alertCount.count ?? 0,
    });
    const result = await runAi(aiDeps(supabase), MEMBER_SUMMARY, { parts });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    return { ok: true, view: result.data };
  } catch (e) {
    console.error("[memberSummary]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the summary. Please try again." };
  }
}
