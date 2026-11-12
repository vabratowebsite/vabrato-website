// The model every AI feature uses, and what it costs. One place to change.
//
// Claude Opus 5.5 by default. If it declines a request for policy reasons the
// API retries the same request on Claude Opus 4.8 (server-side fallback).
// Both run under Zero Data Retention; models that require data retention are
// not used (SPEC <ai_rules>).

export const MODEL = "claude-opus-5-5";
export const FALLBACK_MODEL = "claude-opus-4-8";

/**
 * Most PDF pages one request may carry, per model: Anthropic's PDF support
 * page (read 2026-11-13) gives 600 pages per request, or 100 when the
 * request's context window is under 1M tokens. Both models here have 1M.
 * An unknown model gets the lower limit.
 */
const MAX_PDF_PAGES: Record<string, number> = {
  "claude-opus-5-5": 600,
  "claude-opus-4-8": 600,
};

/** The page limit for a PDF sent to the assistant: the lower of the model and its fallback. */
export function pdfPageLimit(model = MODEL, fallback = FALLBACK_MODEL): number {
  return Math.min(MAX_PDF_PAGES[model] ?? 100, MAX_PDF_PAGES[fallback] ?? 100);
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** US dollars per million tokens. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

// An unknown model is priced at the dearest known rate, so the monthly budget
// can't be under-counted.
const DEAREST: Price = Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));

/** Cost in millionths of a US dollar (dollars per million tokens × tokens). */
export function costMicros(model: string, u: Usage): number {
  const p = PRICES[model] ?? DEAREST;
  return Math.ceil(u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite);
}
