import {
  fairHousingBlocks,
  paymentInstructionMatches,
  runAi,
  wrapData,
  type AiDeps,
  type InputPart,
} from "@vabrato/ai";
import { computeCoe, fmtLong, redactContacts, type SupabaseDb } from "@vabrato/lib";
import type { MemberRole } from "../roles";
import { sellerDeals } from "../seller";
import { MEMBER_MESSAGES } from "./ask";
import { DRAFT_COVER_LETTER, DRAFT_MESSAGE, type DraftAnswer } from "./features";
import {
  DRAFT_LIMITS,
  DRAFT_RECIPIENTS,
  type AskCard,
  type DraftKind,
  type Recipient,
} from "./kinds";

// Ask Vabrato's drafts (S5b PR 3), server side. Our code picks the facts:
// the home's address, and a sale's closing date, nothing else (no price,
// escrow number, names or contact details). The member's notes go in as
// their words; contact details in them are replaced first. After the answer:
// contacts redacted, names filled in from our records, lengths capped. The
// member edits and sends the draft themselves; AI never sends.

/** The home a draft is about, as checked on the server with the member's own client. */
export interface DraftHome {
  about: string;
  /** Close of escrow for a member's active sale, ISO; null otherwise. */
  closeDate: string | null;
  /** Set for the member's own deal, so ai_begin checks their access. */
  dealId: string | null;
}

export interface HomeOption {
  /** "deal:<id>" or "tracked:<id>" */
  ref: string;
  label: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The homes a member can pick: their sales (seller, both), the homes they track (buyer, both). Cover letters: tracked homes only. */
export async function homeOptions(
  supabase: SupabaseDb,
  profileId: string,
  role: MemberRole,
  kind: DraftKind,
): Promise<HomeOption[]> {
  const out: HomeOption[] = [];
  if (kind === "message" && (role === "seller" || role === "both")) {
    for (const d of await sellerDeals(supabase))
      if (d.address) out.push({ ref: `deal:${d.id}`, label: `Your sale: ${d.address}` });
  }
  if (role === "buyer" || role === "both") {
    const { data } = await supabase
      .from("tracked_properties")
      .select("id, address")
      .eq("buyer_id", profileId)
      .order("created_at", { ascending: false })
      .limit(30);
    for (const t of data ?? [])
      if (t.address) out.push({ ref: `tracked:${t.id}`, label: t.address });
  }
  return out;
}

/** One line the member typed, tidied and capped. */
export function cleanLine(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** The member's notes: line breaks kept (at most one blank line), control characters removed, capped. */
export function cleanNotes(s: unknown, max: number = DRAFT_LIMITS.notes): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * The home a draft is about, read with the member's own client (RLS): one of
 * their deals, one of their tracked homes, or, for a cover letter, an address
 * they typed. "" means not about a home. Null when the reference isn't theirs.
 */
export async function resolveHome(
  supabase: SupabaseDb,
  profileId: string,
  ref: unknown,
  typed: unknown,
  kind: DraftKind,
): Promise<DraftHome | null | "none"> {
  const r = String(ref ?? "");
  if (r === "") return "none";
  if (r === "typed" && kind === "cover_letter") {
    const about = redactContacts(cleanLine(typed, DRAFT_LIMITS.about));
    return about ? { about, closeDate: null, dealId: null } : null;
  }
  const [type, id] = [r.slice(0, r.indexOf(":")), r.slice(r.indexOf(":") + 1)];
  if (!UUID.test(id)) return null;
  if (type === "deal" && kind === "message") {
    const { data } = await supabase
      .from("deals")
      .select("id, address, ratification_date, days_to_close, status")
      .eq("id", id)
      .maybeSingle();
    if (!data?.address) return null;
    const closeDate =
      data.status === "active" && data.ratification_date && data.days_to_close
        ? computeCoe(data.ratification_date, data.days_to_close)
        : null;
    return { about: cleanLine(data.address, DRAFT_LIMITS.about), closeDate, dealId: data.id };
  }
  if (type === "tracked") {
    const { data } = await supabase
      .from("tracked_properties")
      .select("address")
      .eq("id", id)
      .eq("buyer_id", profileId)
      .maybeSingle();
    return data?.address
      ? { about: cleanLine(data.address, DRAFT_LIMITS.about), closeDate: null, dealId: null }
      : null;
  }
  return null;
}

const FOR_MODEL: Record<Recipient, string> = {
  movers: "their movers",
  contractor: "a contractor",
  lender: "their lender",
  agent: "their agent at Vabrato",
  other: "someone else (see the member's notes)",
};

/** What goes to the model besides the member's notes: who it's for, and the home's address and closing date. */
export function draftParts(
  kind: DraftKind,
  recipient: Recipient,
  home: DraftHome | null,
): InputPart[] {
  const facts = [
    kind === "cover_letter"
      ? "What: a cover letter to go with the member's offer to buy a home."
      : `Who it's for: ${FOR_MODEL[recipient]}.`,
    home ? `The home: ${home.about}.` : "Not about a particular home.",
    home?.closeDate
      ? `Close of escrow on the member's sale, from the contract: ${fmtLong(home.closeDate)}. The member's agent confirms dates.`
      : null,
  ].filter(Boolean);
  return [{ type: "text", text: wrapData("Facts from our records", facts.join("\n")) }];
}

/**
 * Personal details a cover letter must leave out (owner decision 2026-11-14:
 * terms only). Checked on the member's notes before anything is sent, and on
 * the letter. Broader than the Fair Housing check on purpose.
 */
const PERSONAL =
  /\b(famil(?:y|ies)|kids?|child(?:ren)?|sons?|daughters?|bab(?:y|ies)|pregnan\w*|expecting|toddlers?|wife|husband|spouse|married|marriage|newlyweds?|fianc[eé]e?|grand(?:kids|children|child|parents?|ma|pa)|parents|mom|dad|church|faith|relig\w*|pray\w*|god|bless\w*|temple|mosque|synagogue|christian|jewish|muslim|hindu|buddhist|catholic|heritage|ancestr\w*|immigra\w*|ethnic\w*|race|racial|nationality|veterans?|military|disab\w*|wheelchair|retire[ds]?|retirement|elderly|seniors?|young couple|gay|lesbian|pregnancy|photos?|pictures?)\b/gi;

export function personalDetails(text: string): string[] {
  return [...new Set([...text.matchAll(PERSONAL)].map((m) => m[0].toLowerCase()))];
}

export const DRAFT_MESSAGES = {
  noNotes: "Tell Ask Vabrato what the message should say.",
  noLetterNotes: "Tell Ask Vabrato what makes your offer strong.",
  home: "That home isn't one of yours. Pick one from the list.",
  payment:
    "Leave out bank, account or wiring details. Ask Vabrato never writes those, and you should always call your escrow officer to verify wiring instructions.",
  personal:
    "Cover letters here are about your offer only: leave out anything about you or your family, background, faith, age or health, and photos. Fair Housing rules mean a seller shouldn't choose a buyer on those. Try again with the offer's strengths (price, timing, flexibility, preapproval).",
  personalOutput:
    "The letter mentioned personal details we leave out of cover letters, so it isn't shown. Please try again.",
  empty: "The draft didn't come through properly. Please try again.",
  coverOnly: "Offer cover letters are for buyers.",
} as const;

/** The member's and agent's names go in after the model answers; neither is ever sent. */
export interface DraftNames {
  member: string | null;
  agent: string | null;
}

const NAME = /^[\p{L}][\p{L} .'’-]{0,79}$/u;
const nameOr = (name: string | null, placeholder: string) => {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  return NAME.test(n) ? n : placeholder;
};

/** Tidy one answer: plain text, contacts replaced, names filled in, lengths capped. */
export function draftView(a: DraftAnswer, names: DraftNames): { subject: string; body: string } {
  const fill = (s: string) =>
    redactContacts(s)
      .replace(/\[Your name\]/gi, nameOr(names.member, "[Your name]"))
      .replace(/\[Agent['’]s name\]/gi, nameOr(names.agent, "[Agent's name]"));
  const subject = cleanLine(fill(a.subject), DRAFT_LIMITS.subject);
  const body = fill(a.body)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DRAFT_LIMITS.body)
    .trim();
  return { subject, body };
}

export interface DraftRequest {
  kind: DraftKind;
  recipient: Recipient;
  notes: unknown;
  home: DraftHome | null;
}

const error = (feature: DraftKind, question: string, message: string): AskCard => ({
  kind: "error",
  feature,
  question,
  message,
});

/** Write a draft. Checks the member's notes before anything is sent; the pipeline checks Fair Housing and payment details. */
export async function writeDraft(
  deps: AiDeps,
  req: DraftRequest,
  names: DraftNames,
): Promise<AskCard> {
  const { kind } = req;
  const recipient: Recipient = kind === "cover_letter" ? "agent" : req.recipient;
  const notes = cleanNotes(req.notes);
  const question =
    kind === "cover_letter"
      ? `Offer cover letter${req.home ? ` for ${req.home.about}` : ""}`
      : `Draft for ${DRAFT_RECIPIENTS[recipient].toLowerCase()}${req.home ? ` about ${req.home.about}` : ""}`;
  if (!notes)
    return error(
      kind,
      question,
      kind === "cover_letter" ? DRAFT_MESSAGES.noLetterNotes : DRAFT_MESSAGES.noNotes,
    );
  if (paymentInstructionMatches(notes).length) return error(kind, question, DRAFT_MESSAGES.payment);
  if (kind === "cover_letter" && personalDetails(notes).length)
    return error(kind, question, DRAFT_MESSAGES.personal);

  const r = await runAi(deps, kind === "cover_letter" ? DRAFT_COVER_LETTER : DRAFT_MESSAGE, {
    instruction: redactContacts(notes),
    parts: draftParts(kind, recipient, req.home),
    dealId: req.home?.dealId ?? null,
  });
  if (!r.ok) return error(kind, question, MEMBER_MESSAGES[r.reason]);
  if (!r.data) return error(kind, question, DRAFT_MESSAGES.empty);
  const view = draftView(r.data, names);
  if (!view.body) return error(kind, question, DRAFT_MESSAGES.empty);
  if (kind === "cover_letter" && personalDetails(`${view.subject}\n${view.body}`).length)
    return error(kind, question, DRAFT_MESSAGES.personalOutput);
  return {
    kind: "draft",
    question,
    draftKind: kind,
    recipient,
    about: req.home?.about ?? null,
    ...view,
  };
}

/**
 * Checks before a draft is saved or handed to the agent (the member may have
 * edited it): lengths, no payment or wiring details stored (hard rule), the
 * Fair Housing check, and for cover letters no personal details.
 */
export function draftSaveProblems(kind: DraftKind, subject: string, body: string): string | null {
  if (!body.trim()) return "The draft is empty.";
  if (subject.length > DRAFT_LIMITS.subject)
    return `Keep the subject under ${DRAFT_LIMITS.subject} characters.`;
  if (body.length > DRAFT_LIMITS.body)
    return `Keep the draft under ${DRAFT_LIMITS.body.toLocaleString("en-US")} characters.`;
  const text = `${subject}\n${body}`;
  if (paymentInstructionMatches(text).length)
    return "Remove the bank, account or wiring details first. They're never saved here; call your escrow officer to verify wiring instructions.";
  const fh = fairHousingBlocks(text);
  if (fh.length)
    return `Reword "${fh[0]!.match}" first: it's wording we can't use under Fair Housing rules.`;
  if (kind === "cover_letter") {
    const p = personalDetails(text);
    if (p.length) return `Cover letters are about your offer only. Remove "${p[0]}" first.`;
  }
  return null;
}
