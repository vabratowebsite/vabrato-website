// What the S6b PR 4 features show on the page (no model code, so client
// components can use these types).

export interface Linked {
  text: string;
  href: string | null;
}

export interface BriefingView {
  headline: string;
  sections: { title: string; items: Linked[] }[];
}

export interface QuestionView {
  answer: string;
  sources: { label: string; href: string }[];
  notInData: boolean;
}

export interface MemberSummaryView {
  summary: string;
  looking_for: string[];
  next_steps: string[];
}

export type SummaryResult<T> = { ok: true; view: T } | { ok: false; error: string };
