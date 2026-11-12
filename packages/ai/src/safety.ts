import { contentStrings, fairHousingIssues, type FairHousingIssue } from "@vabrato/lib";

// Deterministic checks around every model call (SPEC <ai_rules>). They run in
// our code, so they hold whatever a document tells the model to do.

/** Fair Housing check (FH-1) over free text or every string in a JSON value. */
export function fairHousingBlocks(value: unknown): FairHousingIssue[] {
  const seen = new Set<string>();
  const out: FairHousingIssue[] = [];
  for (const s of contentStrings(value)) {
    for (const issue of fairHousingIssues(s)) {
      if (issue.level !== "block" || seen.has(issue.match.toLowerCase())) continue;
      seen.add(issue.match.toLowerCase());
      out.push(issue);
    }
  }
  return out;
}

// "Never generate wiring or payment instructions." Contract terms such as
// "the deposit is wired to escrow within 3 days" are fine; account details
// and "wiring instructions:" are not.
const PAYMENT_PATTERNS: RegExp[] = [
  // A routing or account number: the word, then 8 to 17 digits in a row (not a date or a phone number).
  /\b(?:routing|aba|account|acct|swift|iban|bic)\b[^.\n]{0,30}?\b\d{8,17}\b/i,
  /\bwir(?:e|ing)\s+instructions?\s*(?:are|is|:|below|follow)/i,
  /\b(?:zelle|venmo|cash\s?app|paypal|bitcoin|crypto(?:currency)?|gift\s+cards?)\b[^.\n]{0,60}\b(?:to|at)\b/i,
];

export function paymentInstructionMatches(value: unknown): string[] {
  const out: string[] = [];
  for (const s of contentStrings(value)) {
    for (const p of PAYMENT_PATTERNS) {
      const m = p.exec(s);
      if (m) out.push(m[0]);
    }
  }
  return out;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

function hostOf(url: string): string | null {
  try {
    return new URL(url.startsWith("www.") ? `https://${url}` : url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Hosts of the links in a piece of trusted text (the person's own request). */
export function linkHosts(text: string): string[] {
  return [...new Set((text.match(URL_PATTERN) ?? []).map(hostOf).filter((h): h is string => Boolean(h)))];
}

/**
 * Removes links the answer has no business containing: anything whose host
 * isn't ours or one the person typed themselves. A document can't make the
 * assistant hand out a link.
 */
export function removeForeignLinks(text: string, allowedHosts: string[]): { text: string; removed: number } {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase().replace(/^www\./, "")));
  let removed = 0;
  const cleaned = text.replace(URL_PATTERN, (url) => {
    const host = hostOf(url);
    if (host && (allowed.has(host) || [...allowed].some((a) => host.endsWith(`.${a}`)))) return url;
    removed++;
    return "[link removed]";
  });
  return { text: cleaned, removed };
}

/** Same, for every string in a JSON value. */
export function removeForeignLinksDeep<T>(value: T, allowedHosts: string[]): { value: T; removed: number } {
  let removed = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = removeForeignLinks(v, allowedHosts);
      removed += r.removed;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, removed };
}

/**
 * Wraps text we didn't write (pasted notes, extracted text, MLS remarks) so
 * the model sees it as material, and so the text can't close the wrapper.
 */
export function wrapData(label: string, text: string): string {
  const safeLabel = label.replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, 60) || "data";
  return `<data label="${safeLabel}">\n${text.replace(/<\s*\/\s*data/gi, "<\\/data")}\n</data>`;
}
