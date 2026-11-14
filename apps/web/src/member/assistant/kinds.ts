// Ask Vabrato (S5b): what the page shows. No model code; safe for client
// components. Answers live only in the page's memory (owner decision
// 2026-11-13); a draft is stored only if the member saves it (2026-11-14).

import type { SummaryView } from "./summary";

/** Typed questions and their length limits. */
export const ASK_LIMITS = { explain: 500, search: 300 } as const;
export type TextKind = keyof typeof ASK_LIMITS;
export type AskKind = TextKind | "summarize" | DraftKind;

/** Drafts (S5b PR 3): a message the member sends, or a buyer's offer cover letter (agent only). */
export type DraftKind = "message" | "cover_letter";
export const DRAFT_RECIPIENTS = {
  movers: "Movers",
  contractor: "A contractor",
  lender: "My lender",
  agent: "My agent",
  other: "Someone else",
} as const;
export type Recipient = keyof typeof DRAFT_RECIPIENTS;
export const isRecipient = (v: unknown): v is Recipient => typeof v === "string" && Object.hasOwn(DRAFT_RECIPIENTS, v);
/** Limits shared by the form, the server and the database (0038). */
export const DRAFT_LIMITS = { notes: 800, about: 200, subject: 200, body: 3500 } as const;

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
  | ({
      kind: "summary";
      question: string;
      /** The document's name and length, and how to refer to it when adding to-dos. */
      docName: string;
      pages: number | null;
    } & SummaryView)
  | {
      kind: "draft";
      question: string;
      draftKind: DraftKind;
      recipient: Recipient;
      /** The home it's about (address), or null. */
      about: string | null;
      subject: string;
      body: string;
    }
  | { kind: "error"; feature: AskKind; question: string; message: string };

/** The longest link "Send to my agent" builds (hosts limit request URLs to about 14 KB, cookies included). */
export const MAX_AGENT_LINK = 9000;

/**
 * A draft handed to the agent as a portal message (the member still presses
 * Send). Null when it won't fit a message (4,000 characters) or a link: the
 * page then asks the member to shorten it rather than cut it silently.
 */
export function sendToAgentHref(draftKind: DraftKind, about: string | null, subject: string, body: string): string | null {
  const intro =
    draftKind === "cover_letter"
      ? `Here's a cover letter for my offer${about ? ` on ${about}` : ""}. Could you review it?`
      : `Here's a draft I wrote with Ask Vabrato${subject.trim() ? ` (${subject.trim()})` : ""}:`;
  const text = `${intro}\n\n${body.trim()}`;
  if (!body.trim() || text.length > 4000) return null;
  const href = `/my/messages?draft=${encodeURIComponent(text)}#message-body`;
  return href.length > MAX_AGENT_LINK ? null : href;
}

/** A message to the member's agent, prefilled from a question (the member still presses Send). */
export function askMyAgentHref(question: string): string {
  const text = `I asked Ask Vabrato: "${question.trim()}" Could you help me with this?`.slice(0, 4000);
  return `/my/messages?draft=${encodeURIComponent(text)}#message-body`;
}
