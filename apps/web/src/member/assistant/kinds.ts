// Ask Vabrato (S5b): what the page shows. No model code; safe for client
// components. Answers live only in the page's memory (owner decision
// 2026-11-13); a draft is stored only if the member saves it (2026-11-14).

import type { SummaryView } from "./summary";

/** Typed questions and their length limits. */
export const ASK_LIMITS = { explain: 500, search: 300 } as const;
export type TextKind = keyof typeof ASK_LIMITS;
export type AskKind = TextKind | "summarize" | DraftKind | "compare" | "listing" | PlanKind | "tour" | DesignKind;

/** Design (S5b PR 6): colors and a moodboard, staging ideas, an open-house flyer and posts. */
export type DesignKind = "palette" | "staging" | "flyer";
/** Where a color goes. */
export const COLOR_USES = ["walls", "trim", "accent", "cabinets", "floor", "textiles"] as const;
export type ColorUse = (typeof COLOR_USES)[number];
/** One color, always a checked #RRGGBB (our code draws it; the model only names it). */
export interface PaletteColor {
  hex: string;
  name: string;
  use: ColorUse;
}
export const TILE_KINDS = ["material", "texture", "furniture", "lighting", "plant"] as const;
export type TileKind = (typeof TILE_KINDS)[number];
/** A moodboard tile: a colored square with a label (no images). */
export interface MoodTile {
  label: string;
  hex: string;
  kind: TileKind;
}
export const ROOM_TYPES = {
  living: "Living room",
  kitchen: "Kitchen",
  dining: "Dining room",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  office: "Office",
  entry: "Entry",
  outdoor: "Yard or patio",
  other: "Another room",
} as const;
export type RoomType = keyof typeof ROOM_TYPES;
export const isRoomType = (v: unknown): v is RoomType => typeof v === "string" && Object.hasOwn(ROOM_TYPES, v);
/** A flyer: for an open house, or "just listed". */
export const PROMO_KINDS = { open_house: "Open house", just_listed: "Just listed" } as const;
export type PromoKind = keyof typeof PROMO_KINDS;
export const isPromoKind = (v: unknown): v is PromoKind => typeof v === "string" && Object.hasOwn(PROMO_KINDS, v);
/** Limits shared by the form, the server and the database (0041). */
export const DESIGN_LIMITS = {
  paletteNotes: 600,
  stagingNotes: 800,
  flyerNotes: 1000,
  headline: 80,
  highlight: 90,
  highlights: 6,
  blurb: 600,
  instagram: 600,
  facebook: 800,
  declineNote: 300,
} as const;

/** Schedules (S5b PR 5): a moving plan or a pre-listing checklist. */
export type PlanKind = "moving" | "prelisting";
/** One dated step; the date is worked out by our code, never the model. */
export interface PlanItem {
  title: string;
  detail: string;
  /** ISO date. */
  date: string;
  /** The planned date had passed: do it as soon as possible. */
  asap: boolean;
  category: string;
}
/** One stop of a tour day, in the order our code chose. */
export interface TourStopView {
  key: string;
  label: string;
  broker: string | null;
  /** Home A, B, ... as sent to the model; null for a home whose seller opted out (never sent). */
  letter: string | null;
  openHouse: { start: string; end: string | null } | null;
  /** Straight-line miles from the stop before, not driving distance. */
  milesFromPrevious: number | null;
  optedOut: boolean;
  lookFor: string[];
}
/** Notes on a plan: at most this long. */
export const PLAN_NOTES_MAX = { moving: 600, prelisting: 800 } as const;

/** Listings (S5b PR 4): a question about one home is at most this long. */
export const LISTING_QUESTION_MAX = 300;

/** A home in a listing answer: what the page names it, and its broker (MLS attribution). */
export interface CardHome {
  key: string;
  label: string;
  broker: string | null;
}

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
  | {
      kind: "compare";
      question: string;
      /** Home A, B, ... in the order sent. */
      homes: (CardHome & { letter: string })[];
      /** Opted out of AI (MLS-3): facts only on the compare page, not sent. */
      excluded: CardHome[];
      summary: string[];
      differences: { topic: string; values: string[] }[];
      questions: string[];
    }
  | {
      kind: "listing";
      question: string;
      home: CardHome;
      answer: string;
      /** The listing fields the answer relies on (only ones we sent), in plain words. */
      sources: string[];
      notInListing: boolean;
    }
  | {
      kind: "plan";
      question: string;
      planKind: PlanKind;
      /** "Move day (from your sale)", "Your list date"... */
      anchorLabel: string;
      anchor: string;
      /** Dates of record from the schedule engine, shown as fixed (never from the model). */
      fixed: { label: string; date: string }[];
      items: PlanItem[];
      tips: string[];
      /** Steps our checks dropped (contract deadlines, dollar figures, value opinions, out of range). */
      dropped: number;
    }
  | { kind: "tour"; question: string; date: string; stops: TourStopView[]; summary: string[]; bring: string[] }
  | { kind: "palette"; question: string; name: string; colors: PaletteColor[]; tiles: MoodTile[]; notes: string[]; dropped: number }
  | {
      kind: "staging";
      question: string;
      room: RoomType;
      summary: string;
      keep: string[];
      remove: string[];
      add: string[];
      arrange: string[];
      palette: PaletteColor[];
      todos: { title: string; detail: string }[];
      /** Ideas our checks dropped (costs, value opinions, Fair Housing). */
      dropped: number;
    }
  | { kind: "flyer"; question: string; promoKind: PromoKind; headline: string; highlights: string[]; blurb: string; instagram: string; facebook: string }
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
