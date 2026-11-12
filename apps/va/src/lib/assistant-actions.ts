"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { ASSISTANT_FEATURES, MASTER_FLAG, aiSettingsError, checkContract, intakeFolder, isOwnIntakePath } from "@/lib/assistant";
import { CONTRACT_READER, toIntakeProposal } from "@/lib/contract-reader";
import type { IntakeProposal } from "@/lib/intake-fields";
import type { ActionState } from "@/lib/lead-actions";
import { supabaseServer } from "@/lib/supabase-server";

// The VA assistant (S6b PR 2): the contract reader, and the admin controls.
// Every model call goes through packages/ai (switches, limits, checks, usage
// log); every setting goes through the 0026/0027 database functions, which
// check that the caller is an admin again and write the audit log.

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

export type ReadContractResult = { ok: true; proposal: IntakeProposal } | { ok: false; error: string };

/**
 * Reads a contract the caller just uploaded to their own staging folder and
 * returns proposed intake values. Nothing is saved: not the answer, and not
 * the file, which is deleted whatever happens (with anything else left in the
 * caller's staging folder by an earlier attempt).
 */
export async function readContractAction(path: string): Promise<ReadContractResult> {
  const { supabase, profile } = await staffClient();
  if (typeof path !== "string" || !isOwnIntakePath(path, profile.id)) return { ok: false, error: "Upload the contract again." };
  const bucket = supabase.storage.from("deal-docs");
  try {
    if (!aiKeyConfigured()) return { ok: false, error: "The assistant isn't set up yet: it has no API key. Ask an admin." };
    const { data: file, error } = await bucket.download(path);
    if (error || !file) return { ok: false, error: "Couldn't open the uploaded contract. Upload it again." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const problem = checkContract(bytes.length, bytes.subarray(0, 8));
    if (problem) return { ok: false, error: problem };

    const result = await runAi(aiDeps(supabase), CONTRACT_READER, { parts: [{ type: "pdf", data: bytes.toString("base64"), title: "Purchase contract" }] });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    return { ok: true, proposal: toIntakeProposal(result.data) };
  } catch (e) {
    console.error("[readContract]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong reading the contract. Fill in the form by hand, or try again." };
  } finally {
    try {
      const { data: left } = await bucket.list(intakeFolder(profile.id), { limit: 100 });
      const paths = [...new Set([path, ...(left ?? []).map((f) => `${intakeFolder(profile.id)}/${f.name}`)])];
      await bucket.remove(paths);
    } catch {
      // Removed on the next read; only the uploader and admins can see it meanwhile.
    }
  }
}

// --- Admin controls ---------------------------------------------------------------------------

const refresh = () => {
  revalidatePath("/assistant");
  revalidatePath("/deals/new");
};

const FLAGS = new Set<string>([MASTER_FLAG, ...ASSISTANT_FEATURES.map((f) => f.flag)]);

export async function setAiFlagAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const key = String(form.get("key") ?? "");
  const on = form.get("on") === "true";
  if (!FLAGS.has(key)) return { error: "That isn't an assistant feature." };
  const { error } = await supabase.rpc("set_ai_flag", { p_key: key, p_on: on });
  if (error) return { error: aiSettingsError(error.message) };
  refresh();
  const name = key === MASTER_FLAG ? "The assistant" : (ASSISTANT_FEATURES.find((f) => f.flag === key)?.name ?? "The feature");
  return { error: null, ok: `${name} is now ${on ? "on" : "off"}.` };
}

export async function confirmZdrAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const note = String(form.get("note") ?? "").trim();
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you have Anthropic's confirmation in writing." };
  if (note.length < 10 || note.length > 300) return { error: "Say where the confirmation is filed, in 10 to 300 characters (for example: email from Anthropic, the date, who has it)." };
  const { error } = await supabase.rpc("confirm_ai_zdr", { p_note: note });
  if (error) return { error: aiSettingsError(error.message) };
  refresh();
  return { error: null, ok: "Recorded. The assistant can now be turned on." };
}

const whole = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,9}$/, `${what}: enter a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${what}: enter ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`);

const Limits = z.object({
  requests_staff: whole(0, 10_000, "Staff requests a day"),
  requests_member: whole(0, 10_000, "Member requests a day"),
  tokens_staff: whole(0, 100_000_000, "Staff tokens a day"),
  tokens_member: whole(0, 100_000_000, "Member tokens a day"),
  budget: whole(0, 100_000, "Monthly budget"),
});

export async function setAiLimitsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const parsed = Limits.safeParse(Object.fromEntries(Object.keys(Limits.shape).map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the limits." };
  const l = parsed.data;
  const { error } = await supabase.rpc("set_ai_limits", {
    p_requests_staff: l.requests_staff,
    p_requests_member: l.requests_member,
    p_tokens_staff: l.tokens_staff,
    p_tokens_member: l.tokens_member,
    p_monthly_budget_usd: l.budget,
  });
  if (error) return { error: aiSettingsError(error.message) };
  refresh();
  return { error: null, ok: "Limits saved." };
}
