// FH-1 copy check for staff-written website content (city guides, posts,
// testimonials). Deterministic phrase rules, no AI. Run when a revision is
// submitted and again when it's published.
//
// "block" phrases describe people (who lives somewhere, who a home suits) or
// steer by safety or "exclusivity"; the revision can't be submitted or
// published until they're reworded. "warn" phrases are often fine in context
// (a church as a landmark, "family room") and are shown to the author
// and the approver to check.
//
// This catches common phrasing. It doesn't replace a person reading the copy.

export type FairHousingLevel = "block" | "warn";

export interface FairHousingIssue {
  level: FairHousingLevel;
  /** The text that matched, as written. */
  match: string;
  /** Why it's flagged, in plain words. */
  reason: string;
}

interface Rule {
  level: FairHousingLevel;
  pattern: RegExp;
  reason: string;
}

const PEOPLE = "Describes who lives there or who the home suits. Describe the property and the area instead.";
const STEER = "Steering language. Describe facts (distances, amenities) rather than judging an area.";

const RULES: Rule[] = [
  // Familial status.
  { level: "block", pattern: /\b(?:perfect|ideal|great|suited|suitable)\s+for\s+(?:a\s+)?(?:young\s+)?(?:famil(?:y|ies)|couples?|singles?|bachelors?|newlyweds?|empty[-\s]nesters?|retirees?|kids|children|young\s+professionals?|professionals?|students?|seniors?)\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:family|kid|child)[-\s]?friendly\s+(?:neighbou?rhood|area|community|street|town|city)\b/gi, reason: PEOPLE },
  // "no kids", "no young children"; not "no children's play structure".
  { level: "block", pattern: /\b(?:no|without)\s+(?:young\s+)?(?:kids|children)\b(?!['’]s)/gi, reason: PEOPLE },
  // "no families (with kids)", "not for families"; plural only, so "no family room" passes.
  { level: "block", pattern: /\b(?:no|without|not\s+for)\s+(?:young\s+)?families\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\bnot\s+(?:suitable|suited|ideal|good|great|safe|right|meant|intended)\s+for\s+(?:young\s+)?(?:kids|children|famil(?:y|ies))\b(?!['’]s)/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:kids|children|families)\s+(?:are\s+)?not\s+(?:allowed|permitted|welcome)\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\badults?\s+only\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:mature|older|young)\s+(?:couples?|individuals?|persons?|people|residents|neighbou?rs|crowd)\b/gi, reason: PEOPLE },
  // Race, color, national origin, religion.
  { level: "block", pattern: /\b(?:white|black|asian|hispanic|latino|latina|latinx|caucasian|african[-\s]american|ethnic|integrated|segregated)\s+(?:neighbou?rhood|area|community|families|residents|people|population|enclave)\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:christian|jewish|muslim|catholic|hindu|buddhist|mormon)\s+(?:neighbou?rhood|area|community|families|residents|people|population|home|buyers?)\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:english[-\s]speaking|immigrants?|foreigners?|nationality|national\s+origin)\b/gi, reason: PEOPLE },
  { level: "block", pattern: /\b(?:demographics?|racial|ethnicity)\b/gi, reason: PEOPLE },
  // Sex.
  { level: "block", pattern: /\b(?:bachelor\s+pad|man\s+cave|(?:ideal|perfect)\s+for\s+(?:a\s+)?(?:man|woman|men|women|gentleman|lady))\b/gi, reason: PEOPLE },
  // Disability.
  { level: "block", pattern: /\b(?:able[-\s]bodied|no\s+wheelchairs?|not\s+(?:suitable|suited)\s+for\s+(?:the\s+)?(?:handicapped|disabled)|handicapped|crippled|mentally\s+ill)\b/gi, reason: PEOPLE },
  // Steering by safety, crime or exclusivity.
  { level: "block", pattern: /\b(?:safe|safer|safest|unsafe|dangerous|crime[-\s]free|low[-\s]crime|high[-\s]crime|bad|good|nice|better)\s+(?:neighbou?rhoods?|areas?|part\s+of\s+town|side\s+of\s+town|streets?|communit(?:y|ies))\b/gi, reason: STEER },
  { level: "block", pattern: /\bcrime\s+(?:rates?|stats|statistics)\b/gi, reason: STEER },
  { level: "block", pattern: /\b(?:exclusive|restricted|prestigious|desirable|undesirable|traditional|established)\s+(?:neighbou?rhoods?|areas?|communit(?:y|ies)|enclaves?)\b/gi, reason: STEER },
  { level: "block", pattern: /\b(?:up[-\s]and[-\s]coming|transitional|changing)\s+(?:neighbou?rhoods?|areas?|communit(?:y|ies))\b/gi, reason: STEER },
  { level: "block", pattern: /\b(?:best|top[-\s]rated|great|good|excellent)\s+schools?\b/gi, reason: "School quality claims steer buyers (review item 14). Link the official district instead." },
  // Often fine in context; the approver checks.
  { level: "warn", pattern: /\b(?:church(?:es)?|synagogues?|mosques?|temples?|parish)\b/gi, reason: "Fine as a landmark; not as a description of who lives nearby." },
  { level: "warn", pattern: /\b(?:famil(?:y|ies)|kids|children|seniors?|retirees?|singles?|couples?)\b/gi, reason: "Check it describes the place or an event, not who should live there." },
  { level: "warn", pattern: /\b(?:close[-\s]knit|tight[-\s]knit|homogeneous|like[-\s]minded)\b/gi, reason: "Check it isn't a stand-in for who lives nearby." },
  { level: "warn", pattern: /\bschools?\b/gi, reason: "Name or link the district; no ratings or rankings (review item 14)." },
];

/**
 * Finds FH-1 issues in a piece of copy. A "warn" match inside a span that
 * already has a "block" match isn't reported twice.
 */
export function fairHousingIssues(text: string): FairHousingIssue[] {
  if (!text) return [];
  const found: (FairHousingIssue & { start: number; end: number })[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (found.some((f) => f.start < end && start < f.end)) continue;
      found.push({ level: rule.level, match: m[0], reason: rule.reason, start, end });
    }
  }
  return found
    .sort((a, b) => (a.level === b.level ? a.start - b.start : a.level === "block" ? -1 : 1))
    .map(({ level, match, reason }) => ({ level, match, reason }));
}

/** Every string in a content body (nested arrays and objects included), for checking. */
export function contentStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(contentStrings);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      // URLs and keys aren't prose.
      .filter(([k]) => !/^(?:url|href|source|kind|role|sort|permission_confirmed)$/.test(k))
      .flatMap(([, v]) => contentStrings(v));
  }
  return [];
}

/** Checks a whole revision body. */
export function fairHousingIssuesIn(body: unknown): FairHousingIssue[] {
  const seen = new Set<string>();
  const out: FairHousingIssue[] = [];
  for (const s of contentStrings(body)) {
    for (const issue of fairHousingIssues(s)) {
      const key = `${issue.level}:${issue.match.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(issue);
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "block" ? -1 : 1));
}

export const hasBlockingIssue = (issues: FairHousingIssue[]) => issues.some((i) => i.level === "block");
