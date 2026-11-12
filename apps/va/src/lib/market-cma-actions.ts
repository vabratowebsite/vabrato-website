"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { prepareNote } from "@/lib/drafts";
import type { CmaSubject } from "@/lib/cma";
import { cleanParts, partsText } from "@/lib/kit-parts";
import type { KitResult, KitView } from "@/lib/kit-actions";
import { CMA_WRITEUP, MARKET_UPDATE, cmaFactsJson, cmaInput, cmaToParts, marketInput, marketToParts, type MarketStats } from "@/lib/market-cma";
import { cmaRange } from "@/lib/stats";
import { supabaseServer } from "@/lib/supabase-server";

// S6b PR 6: market updates and CMA write-ups. Our code computes the numbers
// and keeps them with the draft (content.facts) so approval can check every
// number in the text against them. A market update leaves the console only
// once public_stats is on, and reaches the website only through Mark's
// content review.

const NO_KEY = "The assistant isn't set up yet: it has no API key. Ask an admin.";
const COLS = "id, kind, status, content, sent_via";

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const toView = (r: { id: string; kind: string; status: string; content: unknown; sent_via: string | null }): KitView => ({
  id: r.id,
  kind: r.kind as KitView["kind"],
  status: r.status as KitView["status"],
  parts: cleanParts(r.kind as KitView["kind"], r.content),
  sent_via: r.sent_via,
});

export async function writeMarketUpdateAction(city: string, months: number, note: string): Promise<KitResult> {
  if (!/^[a-z0-9-]{1,80}$/.test(city) || ![3, 6, 12, 24].includes(months)) return { ok: false, error: "Choose a city and period first." };
  const prepared = prepareNote(note);
  if (prepared.error) return { ok: false, error: prepared.error };
  try {
    const { supabase } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const { data: stats, error: statsError } = await supabase.rpc("market_stats", { p_slug: city, p_months: months });
    if (statsError || !stats) return { ok: false, error: "Market statistics aren't available for that city right now." };
    const facts = stats as unknown as MarketStats;
    const result = await runAi(aiDeps(supabase), MARKET_UPDATE, { instruction: prepared.note, parts: marketInput(facts) });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const parts = marketToParts(result.data);
    const { data: saved, error } = await supabase
      .from("ai_drafts")
      .insert({ kind: "market_update", subject: (parts.title ?? "").slice(0, 200) || "Market update", body: partsText("market_update", parts), content: { ...parts, facts } as never })
      .select(COLS)
      .single();
    if (error || !saved) return { ok: false, error: "Couldn't save the update. Please try again." };
    revalidatePath("/assistant");
    return { ok: true, view: toView(saved), message: "Update ready. Check every figure against the statistics, edit it, then approve it." };
  } catch (e) {
    console.error("[writeMarketUpdate]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the update. Please try again." };
  }
}

export async function writeCmaWriteupAction(cmaId: string, note: string): Promise<KitResult> {
  if (!z.string().uuid().safeParse(cmaId).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const prepared = prepareNote(note);
  if (prepared.error) return { ok: false, error: prepared.error };
  try {
    const { supabase } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const { data: cma } = await supabase.from("cmas").select("id, subject, comp_keys").eq("id", cmaId).maybeSingle();
    if (!cma) return { ok: false, error: "That CMA isn't one you can open." };
    const subject = cma.subject as unknown as CmaSubject;
    const [{ data: comps }, { data: city }] = await Promise.all([
      cma.comp_keys.length ? supabase.rpc("cma_comps", { p_keys: cma.comp_keys }) : Promise.resolve({ data: [] as never[] }),
      supabase.from("cities").select("name").eq("slug", subject.city_slug).maybeSingle(),
    ]);
    const found = comps ?? [];
    if (!found.length) return { ok: false, error: "This CMA has no comparable sales to write about." };
    const range = cmaRange(found, subject.sqft ?? null);
    const input = {
      subject: { city: city?.name ?? null, sub_type: subject.sub_type ?? null, beds: subject.beds ?? null, baths: subject.baths ?? null, sqft: subject.sqft ?? null },
      comps: found,
      range,
    };
    const result = await runAi(aiDeps(supabase), CMA_WRITEUP, { instruction: prepared.note, parts: cmaInput(input) });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const parts = cmaToParts(result.data, found.map((c) => c.listing_key));
    const { data: saved, error } = await supabase
      .from("ai_drafts")
      .insert({ kind: "cma_writeup", cma_id: cmaId, subject: "CMA summary", body: partsText("cma_writeup", parts), content: { ...parts, facts: cmaFactsJson(input) } as never })
      .select(COLS)
      .single();
    if (error || !saved) return { ok: false, error: "Couldn't save the summary. Please try again." };
    revalidatePath(`/cmas/${cmaId}`);
    return { ok: true, view: toView(saved), message: "Summary ready. Check every figure against the comparables, edit it, then approve it." };
  } catch (e) {
    console.error("[writeCmaWriteup]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the summary. Please try again." };
  }
}

const slugPart = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

/**
 * Sends an approved market update to Mark's content review as a website post
 * (kind market_update). Only while public_stats is on (MLS-10); publishing
 * itself stays Mark's (or Viv's while he's away).
 */
export async function sendMarketToWebsiteAction(id: string): Promise<KitResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const { data: d } = await supabase.from("ai_drafts").select(`${COLS}, created_at`).eq("id", id).eq("kind", "market_update").maybeSingle();
  if (!d) return { ok: false, error: "That isn't yours." };
  const view = toView(d);
  if (view.status !== "approved") return { ok: false, error: "Approve it first.", view };
  if (view.sent_via === "website") return { ok: false, error: "It's already in website review.", view };
  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "public_stats").maybeSingle();
  if (!flag?.enabled) return { ok: false, error: "Market statistics can't go on the website until MLSListings confirms public use (the public_stats switch).", view };
  const facts = ((d.content as Record<string, unknown> | null)?.facts ?? {}) as Record<string, unknown>;
  const slug = `market-update-${slugPart(String(facts.city ?? "city"))}-${String(d.created_at).slice(0, 7)}-${id.slice(0, 6)}`;
  const { data: rev, error } = await supabase.rpc("save_content_draft", {
    p_revision: null as unknown as string,
    p_table: "posts",
    p_key: slug,
    p_body: { kind: "market_update", title: view.parts.title, excerpt: view.parts.excerpt, body_md: view.parts.body_md } as never,
  });
  if (error || !rev) return { ok: false, error: "Couldn't create the website draft. Please try again.", view };
  const { error: submitError } = await supabase.rpc("submit_content", { p_revision: rev as string });
  if (submitError) return { ok: false, error: `Saved as a website draft but not sent for review: ${submitError.message}`, view };
  const { data: used } = await supabase.from("ai_drafts").update({ sent_via: "website" }).eq("id", id).select(COLS).maybeSingle();
  revalidatePath("/content");
  return { ok: true, view: used ? toView(used) : view, message: "Sent to website review. Mark (or Viv while he's away) publishes it." };
}
