import type { Citation, Effort, ModelClient, ModelPart } from "./client";
import { ModelError } from "./client";
import { costMicros } from "./models";
import { ALWAYS_RULES } from "./rules";
import { fairHousingBlocks, linkHosts, paymentInstructionMatches, removeForeignLinks, removeForeignLinksDeep, wrapData } from "./safety";
import type { AiStore, FinishInfo } from "./store";

// The one way to call the model. Every AI feature, staff or member, goes
// through runAi(), in this order:
//
//   1. switches and limits (database: master flag, feature flag, who may use
//      it, daily and monthly limits)
//   2. Fair Housing check of the person's own words
//   3. the request is assembled: our instructions and rules as the system
//      prompt; documents and pasted text as data, never as instructions
//   4. the model call (no tools: the model can't do anything, only write)
//   5. checks on the whole answer: payment instructions, Fair Housing, links
//   6. the usage log (tokens, cost, outcome; never the content)
//
// The answer is returned only after step 5, so nothing unchecked is shown.

export type FeatureKey = `staff_${string}` | `member_${string}`;

export type AiOutput<T> = { kind: "text" } | { kind: "json"; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T };

export interface AiFeature<T = never> {
  key: FeatureKey;
  /** What this feature does and how to answer. Static text: no names, dates or data. */
  system: string;
  effort: Effort;
  maxTokens?: number;
  output: AiOutput<T>;
}

export type InputPart =
  /** Context written by our code (e.g. "The deal closes on …"). */
  | { type: "text"; text: string }
  /** Text we didn't write: pasted notes, MLS remarks, extracted text. */
  | { type: "data"; label: string; text: string }
  | { type: "pdf"; data: string; title: string; citations?: boolean }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

export interface AiInput {
  /** The person's own request, in their words. */
  instruction?: string;
  parts?: InputPart[];
  dealId?: string | null;
  /** Hosts that may appear in links in the answer (ours). Links the person typed are allowed too. */
  allowedLinkHosts?: string[];
}

export type AiFailure =
  | "off"
  | "daily_requests"
  | "daily_tokens"
  | "monthly_budget"
  | "fair_housing_input"
  | "fair_housing_output"
  | "payment_instructions"
  | "refused"
  | "invalid_output"
  | "busy"
  | "too_large"
  | "error";

export type AiResult<T> =
  | { ok: true; text: string; data: T | null; citations: Citation[]; notices: string[]; aiGenerated: true }
  | { ok: false; reason: AiFailure; message: string; phrases?: string[] };

/** What gets logged: never the request or the answer. */
export interface AiLogEvent {
  feature: string;
  status: FinishInfo["status"] | AiFailure;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  ms: number;
}

export interface AiDeps {
  store: AiStore;
  model: ModelClient;
  log?: (event: AiLogEvent) => void;
  now?: () => number;
}

const MESSAGES: Record<AiFailure, string> = {
  off: "The assistant isn't switched on yet.",
  daily_requests: "You've reached today's limit for the assistant. It resets at midnight Pacific time.",
  daily_tokens: "You've reached today's limit for the assistant. It resets at midnight Pacific time.",
  monthly_budget: "The assistant has reached this month's budget. An admin can raise it in Settings.",
  fair_housing_input:
    "I can't help choose or describe homes or areas by who lives there, or rate areas as safe or good (Fair Housing). I can help with the property itself, distances, transit and parks. For schools and crime, use official sources: the school district's own site, the city, and hud.gov.",
  fair_housing_output: "The draft used wording we can't use under Fair Housing rules, so it isn't shown. Try again, or reword the request.",
  payment_instructions: "The answer isn't shown because it contained payment or wiring details. The assistant never gives those. Call your escrow officer to verify wiring.",
  refused: "The assistant couldn't help with this request.",
  invalid_output: "The assistant's answer wasn't usable. Please try again.",
  busy: "The assistant is busy right now. Please try again in a minute.",
  too_large: "This file is too large for the assistant to read in one go. Split this file and check the parts.",
  error: "Something went wrong. Please try again.",
};

const DEFAULT_MAX_TOKENS = 64000;
const usesCitations = (parts: InputPart[]) => parts.some((p) => p.type === "pdf" && p.citations);

function toModelParts(input: AiInput): ModelPart[] {
  const parts: ModelPart[] = [];
  for (const p of input.parts ?? []) {
    if (p.type === "data") parts.push({ type: "text", text: wrapData(p.label, p.text) });
    else parts.push(p);
  }
  // Documents first, the request last.
  if (input.instruction?.trim()) parts.push({ type: "text", text: `Request from the person using the assistant:\n${input.instruction.trim()}` });
  return parts;
}

export async function runAi<T = never>(deps: AiDeps, feature: AiFeature<T>, input: AiInput): Promise<AiResult<T>> {
  const now = deps.now ?? Date.now;
  const started = now();
  const parts = input.parts ?? [];
  if (feature.output.kind === "json" && usesCitations(parts)) throw new Error(`${feature.key}: citations can't be combined with JSON output`);
  if (!input.instruction?.trim() && parts.length === 0) throw new Error(`${feature.key}: nothing to send`);

  const fail = (reason: AiFailure, extra: { phrases?: string[] } = {}): AiResult<T> => {
    deps.log?.({ feature: feature.key, status: reason, ms: now() - started });
    return { ok: false, reason, message: MESSAGES[reason], ...extra };
  };

  // 1. Switches and limits.
  const gate = await deps.store.begin(feature.key, input.dealId ?? null);
  if (!gate.allowed) return fail(gate.reason);
  const runId = gate.run_id;
  const close = async (info: FinishInfo) => {
    try {
      await deps.store.finish(runId, { ...info, durationMs: now() - started });
    } catch {
      // The answer matters more than the log line; the run stays "started" and still counts as a request.
    }
  };

  // 2. The person's own words.
  const asked = fairHousingBlocks(input.instruction ?? "");
  if (asked.length) {
    await close({ status: "blocked_input" });
    return fail("fair_housing_input", { phrases: asked.map((i) => i.match) });
  }

  // 3 and 4. Assemble and call.
  let result;
  try {
    result = await deps.model.generate({
      system: `${feature.system.trim()}\n\n${ALWAYS_RULES}`,
      parts: toModelParts(input),
      effort: feature.effort,
      maxTokens: feature.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(feature.output.kind === "json" ? { jsonSchema: feature.output.jsonSchema } : {}),
    });
  } catch (e) {
    await close({ status: "error" });
    return fail(e instanceof ModelError && (e.kind === "rate_limited" || e.kind === "overloaded") ? "busy" : e instanceof ModelError && e.kind === "too_large" ? "too_large" : "error");
  }
  const spent = {
    model: result.model,
    inputTokens: result.usage.inputTokens + result.usage.cacheWriteTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    costMicros: costMicros(result.model, result.usage),
  };
  const done = async (status: FinishInfo["status"]) => {
    await close({ status, ...spent });
    deps.log?.({ feature: feature.key, status, model: spent.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, ms: now() - started });
  };
  const stop = async (status: FinishInfo["status"], reason: AiFailure, extra: { phrases?: string[] } = {}): Promise<AiResult<T>> => {
    await done(status);
    return { ok: false, reason, message: MESSAGES[reason], ...extra };
  };

  if (result.stop === "refusal") return stop("refused", "refused");
  if (result.stop !== "end") return stop("error", "invalid_output");

  // 5. Checks on the whole answer.
  let data: T | null = null;
  if (feature.output.kind === "json") {
    try {
      data = feature.output.parse(JSON.parse(result.text));
    } catch {
      return stop("error", "invalid_output");
    }
  }
  const checked: unknown = data ?? result.text;
  if (paymentInstructionMatches(checked).length) return stop("blocked_output", "payment_instructions");
  const wording = fairHousingBlocks(checked);
  if (wording.length) return stop("blocked_output", "fair_housing_output", { phrases: wording.map((i) => i.match) });

  const hosts = [...(input.allowedLinkHosts ?? []), ...linkHosts(input.instruction ?? "")];
  const notices: string[] = [];
  let text = result.text;
  let removed = 0;
  if (data !== null) {
    const r = removeForeignLinksDeep(data, hosts);
    data = r.value;
    removed = r.removed;
    text = JSON.stringify(data);
  } else {
    const r = removeForeignLinks(text, hosts);
    text = r.text;
    removed = r.removed;
  }
  if (removed) notices.push(`${removed} link${removed === 1 ? " was" : "s were"} removed from the answer.`);

  // 6. Log and return.
  await done("ok");
  return { ok: true, text, data, citations: result.citations, notices, aiGenerated: true };
}
