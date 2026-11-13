import type { AiFeature, AiInput, AiStore, FinishInfo } from "@vabrato/ai";
import { countPdfPages } from "../lib/documents";

// The live test's spending cap (S6b PR 9). Before each call the in-memory
// store refuses ("monthly_budget") if what's been spent plus the call's worst
// case would pass the cap; the call is then reported "not run". The worst
// case assumes the fallback fires and both attempts are billed, the declined
// one at Opus 5.5's price and the answer at Opus 4.8's (the dearer), with no
// retries (the live client runs with maxRetries 0). Prices: models.ts,
// checked against Anthropic's pricing page on 2026-11-13.

const DEFAULT_MAX_TOKENS = 64_000; // packages/ai run.ts
const RULES_TOKENS = 2_000; // ALWAYS_RULES and the request wrapper, generously
const PAGE_TOKENS = 5_000; // 1,500–3,000 text tokens per page plus the page image, rounded up
const IMAGE_TOKENS = 1_600;
const IN_USD_PER_M = 4 + 5; // both attempts' input
const OUT_USD_PER_M = 20 + 25; // both attempts' output, incl. thinking

export interface WorstCase {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function worstCase(feature: AiFeature<any>, input: AiInput): WorstCase {
  let chars = feature.system.length + (input.instruction?.length ?? 0);
  let pages = 0;
  let images = 0;
  for (const p of input.parts ?? []) {
    if (p.type === "text") chars += p.text.length;
    else if (p.type === "data") chars += p.text.length + p.label.length;
    else if (p.type === "pdf") pages += countPdfPages(Buffer.from(p.data, "base64")) ?? 100;
    else images += 1;
  }
  const inputTokens = Math.ceil(chars / 3) + RULES_TOKENS + pages * PAGE_TOKENS + images * IMAGE_TOKENS;
  const outputTokens = feature.maxTokens ?? DEFAULT_MAX_TOKENS;
  return { inputTokens, outputTokens, usd: (inputTokens * IN_USD_PER_M + outputTokens * OUT_USD_PER_M) / 1_000_000 };
}

/**
 * Switches and caps normally come from the database (ai_begin). The live
 * test has no database: this store allows every call unless the budget gate
 * says no, and records what each finished call cost.
 */
export function budgetStore(capUsd: number) {
  let spentMicros = 0;
  let next: WorstCase | null = null;
  const finished: FinishInfo[] = [];
  const store: AiStore = {
    async begin() {
      if (next && spentMicros / 1_000_000 + next.usd > capUsd) return { allowed: false, reason: "monthly_budget" };
      return { allowed: true, run_id: `live-${finished.length + 1}` };
    },
    async finish(_runId, info) {
      finished.push(info);
      spentMicros += info.costMicros ?? 0;
    },
  };
  return {
    store,
    /** Set before each call: the gate compares it with what's left. */
    expect: (w: WorstCase) => void (next = w),
    spentUsd: () => spentMicros / 1_000_000,
    finished,
  };
}
