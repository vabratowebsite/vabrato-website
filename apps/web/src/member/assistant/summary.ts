import type { SummaryAnswer } from "./features";
import { MEMBER_PAGE_LIMIT } from "./files";

// What the page shows from a document summary (S5b PR 2), after our own
// checks: contacts and links removed, page numbers kept only within the
// file's real length, lengths trimmed, repeated to-dos dropped. The pipeline
// has already refused payment details and Fair Housing wording.

export const SUMMARY_LIMITS = { points: 8, questions: 6, todos: 8, text: 300, title: 120 } as const;

const EMAIL = /[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** One line of plain text: no contacts or links, collapsed, within `max` characters. */
export function cleanLine(s: string, max: number): string {
  return s.replace(EMAIL, "").replace(PHONE, "").replace(LINK, "").replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim().slice(0, max).trim();
}

/** Page numbers within the file: 1..pages when known, else 1..the member page limit. */
export function validPages(pages: number[], total: number | null): number[] {
  const max = total ?? MEMBER_PAGE_LIMIT;
  return [...new Set(pages.filter((p) => Number.isInteger(p) && p >= 1 && p <= max))].sort((a, b) => a - b).slice(0, 6);
}

export interface SummaryView {
  docKind: string;
  points: { text: string; pages: number[] }[];
  questions: { text: string; pages: number[] }[];
  todos: { title: string; page: number | null }[];
}

export function summaryView(a: SummaryAnswer, totalPages: number | null): SummaryView {
  const lines = (list: { text: string; pages: number[] }[], n: number) =>
    list
      .map((p) => ({ text: cleanLine(p.text, SUMMARY_LIMITS.text), pages: validPages(p.pages, totalPages) }))
      .filter((p) => p.text)
      .slice(0, n);
  const seen = new Set<string>();
  const todos: SummaryView["todos"] = [];
  for (const t of a.todos) {
    const title = cleanLine(t.title, SUMMARY_LIMITS.title);
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    const page = t.page === null ? null : (validPages([t.page], totalPages)[0] ?? null);
    todos.push({ title, page });
    if (todos.length >= SUMMARY_LIMITS.todos) break;
  }
  return { docKind: cleanLine(a.kind, 60), points: lines(a.summary, SUMMARY_LIMITS.points), questions: lines(a.questions, SUMMARY_LIMITS.questions), todos };
}

/** "p. 14" / "pp. 9, 14" */
export const pagesLabel = (pages: number[]) => (pages.length === 0 ? "" : pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join(", ")}`);
