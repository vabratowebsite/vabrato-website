import { z } from "zod";
import { DEFAULT_CONTINGENCIES } from "@vabrato/lib";
import { fairHousingBlocks, listingForAi, paymentInstructionMatches, type AiFeature, type InputPart } from "@vabrato/ai";
import { firstName } from "./draft-kinds";
import { MAX_SECTIONS, MLS_DESCRIPTION_MAX, VABRATO_SERVICES, cleanParts, partsFor, type KitKind, type Parts } from "./kit-parts";

// S6b PR 5, server side: listing launch kits and presentations. Our code picks
// the facts (the listing at IDX level, the agent's own profile, our timeline
// and services); the model writes the copy; the agent edits and approves it.
// Never sent: private remarks, showing or lockbox details, owner or agent
// contact details (listingForAi drops them), or anything about a client
// beyond a first name the agent typed.

const SHARED = `You write marketing copy for an agent at Vabrato Real Estate Services, a residential brokerage on the San Francisco Peninsula (San Mateo and Santa Clara counties). The agent edits and approves everything you write before anyone sees it; nothing is published automatically.

Use only the facts given. Don't invent features, numbers, awards, school names or distances; if something useful isn't given, leave it out. Never suggest a price, a value or what a home is worth, and never promise a sale price or a timeline. Describe the home and the place (rooms, light, condition, layout, outdoor space, nearby parks and transit when given), never the people who live there or who it would suit. Don't include phone numbers, email addresses or links: the agent adds contact details.`;

const KIT = `${SHARED}

Write a launch kit for one of Vabrato's own listings, from its public listing facts and the agent's notes:
- mls_description: the MLS public remarks, at most ${MLS_DESCRIPTION_MAX} characters, plain sentences, no contact details or links (MLS rules).
- headline: a short headline (under 80 characters).
- instagram, facebook, linkedin: one post each, suited to the network (Instagram may end with a few relevant hashtags; LinkedIn more professional). No emoji clutter.
- email_subject and email_body: a "just listed" email to the agent's contacts, signed with the agent's first name.
- flyer_headline (under 60 characters), flyer_bullets (3 to 6 short highlights), flyer_blurb (2 or 3 sentences).`;

const PRESENTATION = `${SHARED}

Write a presentation the agent will print and walk a client through. Write warmly and plainly, in the agent's voice ("I", "we at Vabrato"). Our code adds the agent's profile card, Vabrato's services and the timeline with its day counts on separate pages, so don't repeat those lists or give dates; refer to them if useful. Use at most ${MAX_SECTIONS} sections of one to three short paragraphs each.`;

const LISTING_PRESENTATION = `${PRESENTATION}

This is a listing presentation for someone thinking of selling their home with Vabrato: an introduction, how we'd prepare and market this home, how showings and offers work, and what to expect through escrow. Don't discuss price: a comparison of recent sales is prepared separately.`;

const BUYER_PRESENTATION = `${PRESENTATION}

This is a buyer presentation for someone thinking of buying with Vabrato: an introduction, how the search and tours work, writing offers, what happens in escrow, and how we keep them informed. Don't discuss prices or loans beyond suggesting they speak with a lender early.`;

const str = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

const KitAnswer = z
  .object({
    mls_description: z.string().max(3000),
    headline: z.string().max(400),
    instagram: z.string().max(4000),
    facebook: z.string().max(4000),
    linkedin: z.string().max(4000),
    email_subject: z.string().max(400),
    email_body: z.string().max(8000),
    flyer_headline: z.string().max(300),
    flyer_bullets: z.array(z.string().max(300)).max(12),
    flyer_blurb: z.string().max(2000),
  })
  .strict();
export type KitAnswer = z.infer<typeof KitAnswer>;

const PresentationAnswer = z.object({ title: z.string().max(300), sections: z.array(z.object({ heading: z.string().max(300), paragraphs: z.array(z.string().max(3000)).max(6) }).strict()).max(12) }).strict();
export type PresentationAnswer = z.infer<typeof PresentationAnswer>;

const json = <T extends z.ZodTypeAny>(schema: Record<string, unknown>, parser: T) => ({ kind: "json" as const, jsonSchema: schema, parse: (v: unknown) => parser.parse(v) as z.infer<T> });

export const LISTING_KIT: AiFeature<KitAnswer> = {
  key: "staff_listing_kit",
  system: KIT,
  effort: "medium",
  maxTokens: 4000,
  output: json(
    obj({ mls_description: str, headline: str, instagram: str, facebook: str, linkedin: str, email_subject: str, email_body: str, flyer_headline: str, flyer_bullets: { type: "array", items: str }, flyer_blurb: str }),
    KitAnswer,
  ),
};

const presentationSchema = obj({ title: str, sections: { type: "array", items: obj({ heading: str, paragraphs: { type: "array", items: str } }) } });
/** Both presentations share one switch (ai_staff_presentations) and one usage key. */
export const PRESENTATIONS: Record<"listing_presentation" | "buyer_presentation", AiFeature<PresentationAnswer>> = {
  listing_presentation: { key: "staff_presentations", system: LISTING_PRESENTATION, effort: "medium", maxTokens: 4000, output: json(presentationSchema, PresentationAnswer) },
  buyer_presentation: { key: "staff_presentations", system: BUYER_PRESENTATION, effort: "medium", maxTokens: 4000, output: json(presentationSchema, PresentationAnswer) },
};

// --- Answers into parts --------------------------------------------------------------------------

export function kitToParts(a: KitAnswer): Parts {
  return cleanParts("listing_kit", { ...a, flyer_bullets: a.flyer_bullets.map((b) => b.trim()).filter(Boolean).slice(0, 6).join("\n") });
}

export function presentationToParts(kind: "listing_presentation" | "buyer_presentation", a: PresentationAnswer): Parts {
  const flat: Record<string, string> = { title: a.title };
  a.sections.slice(0, MAX_SECTIONS).forEach((s, i) => {
    flat[`section_${i + 1}_heading`] = s.heading;
    flat[`section_${i + 1}_text`] = s.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n");
  });
  return cleanParts(kind, flat);
}

// --- What each sends ---------------------------------------------------------------------------

export function kitInput(listing: Record<string, unknown>, senderName: string | null): InputPart[] {
  return [
    { type: "text", text: `Sign as: ${firstName(senderName) ?? "[your name]"}, Vabrato Real Estate Services. This is one of Vabrato's own listings.` },
    { type: "data", label: "The listing (public listing facts)", text: JSON.stringify(listingForAi(listing as never, "IDX")) },
  ];
}

/** Typical milestones from the schedule engine's usual contingency periods and a 30-day close. */
export function typicalTimeline(): { day: number; label: string }[] {
  const LABEL: Record<string, string> = { insurance: "insurance", financing: "loan", appraisal: "appraisal", property_condition: "inspections (property condition)" };
  const byDay = new Map<number, string[]>();
  for (const c of DEFAULT_CONTINGENCIES) byDay.set(c.offsetDays, [...(byDay.get(c.offsetDays) ?? []), LABEL[c.kind] ?? c.kind]);
  return [
    { day: 0, label: "Offer accepted; escrow opens and the deposit goes to escrow" },
    ...[...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, kinds]) => ({ day, label: `Buyer's ${kinds.join(" and ")} contingency removal` })),
    { day: 30, label: "Close of escrow" },
  ];
}

export interface PresentationFacts {
  kind: "listing_presentation" | "buyer_presentation";
  clientFirstName: string | null;
  /** Listing presentation: the home's street address and city. Buyer: the area they're looking in. */
  place: string | null;
  agent: { name: string | null; title: string | null; bio: string | null };
}

export function presentationInput(f: PresentationFacts): InputPart[] {
  const lines = [
    `Client: ${firstName(f.clientFirstName) ?? "(no name given; address them as \"you\")"}.`,
    f.kind === "listing_presentation" ? `Their home: ${f.place?.trim() || "(address not given)"}.` : `Where they're looking: ${f.place?.trim() || "(not given)"}.`,
    `The agent: ${firstName(f.agent.name) ?? "[your name]"}${f.agent.title ? `, ${f.agent.title}` : ""}, Vabrato Real Estate Services.`,
    `Pages our code adds: the agent's profile, Vabrato's services (${VABRATO_SERVICES.length} points), and this timeline: ${typicalTimeline()
      .map((m) => `day ${m.day}: ${m.label}`)
      .join("; ")}.`,
  ];
  const parts: InputPart[] = [{ type: "text", text: lines.join("\n") }];
  if (f.agent.bio?.trim()) parts.push({ type: "data", label: "The agent's own bio", text: f.agent.bio.trim().slice(0, 3000) });
  return parts;
}

// --- Approval ------------------------------------------------------------------------------------

const CONTACT = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}|\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us)\b/i;

/** What stops a kit or presentation from being approved, in plain words. */
export function partsProblems(kind: KitKind, parts: Parts): string[] {
  const problems: string[] = [];
  for (const p of partsFor(kind)) {
    if (p.required && !parts[p.key]?.trim()) problems.push(`Fill in "${p.label}".`);
  }
  const fh = fairHousingBlocks(Object.values(parts).join("\n"));
  if (fh.length) problems.push(`Fair Housing: reword ${fh.map((i) => `"${i.match}"`).join(", ")}. Describe the home and the place, not who it would suit.`);
  if (paymentInstructionMatches(Object.values(parts).join("\n")).length) problems.push("Remove the payment or wiring details.");
  if (kind === "listing_kit") {
    const d = parts.mls_description ?? "";
    if (d.length > MLS_DESCRIPTION_MAX) problems.push(`Shorten the MLS description to ${MLS_DESCRIPTION_MAX.toLocaleString("en-US")} characters.`);
    if (CONTACT.test(d)) problems.push("Take the phone number, email address or link out of the MLS description (MLS rules).");
  }
  return problems;
}
