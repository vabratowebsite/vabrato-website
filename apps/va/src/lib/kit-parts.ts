// Launch kits and presentations (S6b PR 5): the named text parts each one has,
// for the editor, the plain-text copy and the print pages. No model code here,
// so client components can use it. Content is stored in ai_drafts.content as
// a flat map of part → text (0030).

export type KitKind = "listing_kit" | "listing_presentation" | "buyer_presentation" | "market_update" | "cma_writeup";
export type Parts = Record<string, string>;

export interface PartDef {
  key: string;
  label: string;
  rows: number;
  max: number;
  /** Must not be empty to approve. */
  required?: boolean;
  hint?: string;
}

export const MLS_DESCRIPTION_MAX = 1000;
export const MAX_SECTIONS = 6;

export const KIT_PARTS: PartDef[] = [
  { key: "mls_description", label: "MLS description", rows: 7, max: MLS_DESCRIPTION_MAX, required: true, hint: "Up to 1,000 characters. No phone numbers, emails or links (MLS rules)." },
  { key: "headline", label: "Headline", rows: 1, max: 120, required: true },
  { key: "instagram", label: "Instagram post", rows: 4, max: 2200 },
  { key: "facebook", label: "Facebook post", rows: 4, max: 2000 },
  { key: "linkedin", label: "LinkedIn post", rows: 4, max: 2000 },
  { key: "email_subject", label: "Email blast: subject", rows: 1, max: 150 },
  { key: "email_body", label: "Email blast: text", rows: 8, max: 5000 },
  { key: "flyer_headline", label: "Flyer: headline", rows: 1, max: 80, required: true },
  { key: "flyer_bullets", label: "Flyer: highlights (one per line, up to 6)", rows: 6, max: 600, required: true },
  { key: "flyer_blurb", label: "Flyer: short description", rows: 4, max: 600, required: true },
];

export function presentationParts(): PartDef[] {
  const parts: PartDef[] = [{ key: "title", label: "Title", rows: 1, max: 120, required: true }];
  for (let i = 1; i <= MAX_SECTIONS; i++) {
    parts.push({ key: `section_${i}_heading`, label: `Section ${i}: heading`, rows: 1, max: 100, required: i === 1 });
    parts.push({ key: `section_${i}_text`, label: `Section ${i}: text (blank line between paragraphs)`, rows: 6, max: 2500, required: i === 1 });
  }
  return parts;
}

export const MARKET_PARTS: PartDef[] = [
  { key: "title", label: "Title", rows: 1, max: 200, required: true },
  { key: "excerpt", label: "Summary (one or two sentences)", rows: 2, max: 400, required: true },
  { key: "body_md", label: "Article", rows: 14, max: 6000, required: true, hint: "Markdown. Every number must come from the statistics above; the check at approval lists any that don't." },
];

export const CMA_PARTS: PartDef[] = [
  { key: "summary", label: "Summary", rows: 8, max: 3000, required: true, hint: "Every number must come from the comparables and range above. A comparison of recent sales, not an appraisal." },
  { key: "comparables", label: "Notes on each comparable (one per line)", rows: 6, max: 3000 },
  { key: "adjustments_note", label: "What to keep in mind", rows: 3, max: 1500 },
];

export function partsFor(kind: KitKind): PartDef[] {
  if (kind === "listing_kit") return KIT_PARTS;
  if (kind === "market_update") return MARKET_PARTS;
  if (kind === "cma_writeup") return CMA_PARTS;
  return presentationParts();
}

/** Only known parts, as trimmed strings, cut to their limits. */
export function cleanParts(kind: KitKind, raw: unknown): Parts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Parts = {};
  for (const p of partsFor(kind)) {
    const v = src[p.key];
    out[p.key] = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, p.max) : "";
  }
  return out;
}

/** The plain-text copy kept in ai_drafts.body (lists, copying everything at once). */
export function partsText(kind: KitKind, parts: Parts): string {
  const text = partsFor(kind)
    .filter((p) => parts[p.key]?.trim())
    .map((p) => `${p.label}\n${parts[p.key]!.trim()}`)
    .join("\n\n");
  return text.slice(0, 8000) || "(empty)";
}

/** Presentation sections that have a heading or text, in order. */
export function sections(parts: Parts): { heading: string; paragraphs: string[] }[] {
  const out: { heading: string; paragraphs: string[] }[] = [];
  for (let i = 1; i <= MAX_SECTIONS; i++) {
    const heading = parts[`section_${i}_heading`]?.trim() ?? "";
    const paragraphs = (parts[`section_${i}_text`] ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (heading || paragraphs.length) out.push({ heading, paragraphs });
  }
  return out;
}

export const bullets = (s: string | undefined) =>
  (s ?? "")
    .split("\n")
    .map((b) => b.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);

export const KIND_TITLE: Record<KitKind, string> = { listing_kit: "Launch kit", listing_presentation: "Listing presentation", buyer_presentation: "Buyer presentation", market_update: "Market update", cma_writeup: "CMA write-up" };

/** What Vabrato offers, for presentations (our words, not the model's). */
export const VABRATO_SERVICES = [
  "A dedicated agent with a transaction coordinator and assistant behind every sale.",
  "A shared timeline in your Vabrato portal: every deadline, task and document in one place.",
  "Weekly updates on showings, saves and feedback while your home is on the market.",
  "Local knowledge of San Mateo and Santa Clara counties.",
];
