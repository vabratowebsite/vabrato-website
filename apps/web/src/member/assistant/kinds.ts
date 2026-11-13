// Ask Vabrato (S5b): what the page shows. No model code; safe for client
// components. Answers live only in the page's memory: nothing is kept
// (owner decision 2026-11-13).

export const ASK_LIMITS = { explain: 500, search: 300 } as const;
export type AskKind = keyof typeof ASK_LIMITS;

export type AskCard =
  | { kind: "explain"; question: string; text: string }
  | {
      kind: "search";
      question: string;
      /** Plain-language filter chips ("San Carlos", "3+ beds", "Under $2.5M"). */
      chips: string[];
      /** Where "Run this search" goes: /search, or /my/sold for sold homes. */
      href: string;
      /** Parts of the sentence the filters couldn't use, and why. */
      notes: string[];
    }
  | { kind: "error"; feature: AskKind; question: string; message: string };

/** A message to the member's agent, prefilled from a question (the member still presses Send). */
export function askMyAgentHref(question: string): string {
  const text = `I asked Ask Vabrato: "${question.trim()}" Could you help me with this?`.slice(0, 4000);
  return `/my/messages?draft=${encodeURIComponent(text)}#message-body`;
}
