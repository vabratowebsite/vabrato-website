"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AIDraftLabel, SparkleIcon } from "@vabrato/ui/web";
import { Markdown } from "@vabrato/ui/markdown";
import { askExplainAction, askSearchAction } from "@/app/my/assistant/actions";
import { ASK_LIMITS, askMyAgentHref, type AskCard, type AskKind } from "../assistant/kinds";

// Ask Vabrato (mockup 11, S5b PR 1). Answers stay in this page's memory only:
// leaving the page clears them, and nothing is stored (owner decision
// 2026-11-13). No model code here; the actions run on the server.

const MODES: Record<AskKind, { label: string; field: string; hint: string; button: string }> = {
  explain: {
    label: "Explain a term",
    field: "The term or question",
    hint: "For example: What does \"contingency removal\" mean?",
    button: "Explain",
  },
  search: {
    label: "Search by sentence",
    field: "Describe the homes you're looking for",
    hint: "For example: 3-bed house in San Carlos under $2.5M.",
    button: "Make the search",
  },
};

const linkBtn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function AskVabrato({ kinds, left, limit }: { kinds: AskKind[]; left: number; limit: number }) {
  const [mode, setMode] = useState<AskKind>(kinds[0]!);
  const [text, setText] = useState("");
  const [cards, setCards] = useState<(AskCard & { id: number })[]>([]);
  const [remaining, setRemaining] = useState(left);
  const [pending, start] = useTransition();
  const next = useRef(1);
  const newest = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const m = MODES[mode];
  const max = ASK_LIMITS[mode];

  // Focus moves to each new answer, so it's read out once (not a live region).
  useEffect(() => newest.current?.focus(), [cards.length]);

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (!question || pending) return;
    start(async () => {
      let card: AskCard;
      try {
        card = mode === "explain" ? await askExplainAction(question) : await askSearchAction(question);
      } catch {
        card = { kind: "error", feature: mode, question, message: "Something went wrong. Please try again." };
      }
      setCards((c) => [...c, { ...card, id: next.current++ }]);
      setRemaining((r) => Math.max(0, r - 1));
      if (card.kind !== "error") setText("");
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={ask} className="space-y-4 border border-line bg-white p-4 font-body sm:p-6">
        {kinds.length > 1 && (
          <fieldset>
            <legend className="text-body-sm font-medium text-ink">What would you like to do?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {kinds.map((k) => (
                <label key={k} className={`inline-flex min-h-[44px] cursor-pointer items-center border px-4 text-body-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy ${mode === k ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>
                  <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="sr-only" />
                  {MODES[k].label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor={`${uid}-q`} className="block text-body-sm font-medium text-ink">
            {m.field}
          </label>
          <p id={`${uid}-hint`} className="mt-1 text-caption text-muted">
            {m.hint}
          </p>
          <textarea
            id={`${uid}-q`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, max))}
            maxLength={max}
            rows={3}
            required
            aria-describedby={`${uid}-hint ${uid}-count`}
            className="mt-2 block w-full border border-muted bg-white px-3 py-2 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy"
          />
          <p id={`${uid}-count`} className="mt-1 text-caption text-muted">
            {text.length} of {max} characters
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending || !text.trim() || remaining === 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-navy px-6 text-label font-medium uppercase tracking-label text-white hover:bg-navy-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
          >
            <SparkleIcon size={14} />
            {m.button}
          </button>
          <p className="text-caption text-muted">
            {remaining} of {limit} questions left today
          </p>
          {pending && (
            <p role="status" className="text-body-sm text-ink">
              Writing…
            </p>
          )}
        </div>
      </form>

      {cards.length > 0 && (
        <ol className="space-y-6 [overflow-wrap:anywhere]" aria-label="Your questions and answers, oldest first">
          {cards.map((c, i) => (
            <li key={c.id} className="space-y-3">
              <p className="ml-auto max-w-[85%] bg-navy px-4 py-3 font-body text-body-sm text-white sm:max-w-[70%]">
                <span className="sr-only">You asked: </span>
                {c.question}
              </p>
              <Answer card={c} headingRef={i === cards.length - 1 ? newest : undefined} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Answer({ card, headingRef }: { card: AskCard; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const heading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1} className="font-subhead text-subhead-sm text-ink outline-none">
      {text}
    </h2>
  );
  if (card.kind === "error") {
    return (
      <div className="space-y-3 border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
        {heading("No answer")}
        <p>{card.message}</p>
        {card.question && (
          <a href={askMyAgentHref(card.question)} className={`${linkBtn} border border-navy bg-white text-navy hover:bg-navy-50`}>
            Ask my agent
          </a>
        )}
      </div>
    );
  }
  if (card.kind === "explain") {
    return (
      <div className="space-y-4 border border-line bg-soft p-4 sm:p-6">
        <AIDraftLabel />
        {heading("What it means")}
        <Markdown>{card.text}</Markdown>
        <p className="font-body text-caption text-muted">Written by AI and can be wrong. Not legal or tax advice: ask your agent about your own situation.</p>
        <a href={askMyAgentHref(card.question)} className={`${linkBtn} border border-navy bg-white text-navy hover:bg-navy-50`}>
          Ask my agent
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body sm:p-6">
      <AIDraftLabel />
      {heading("Your search")}
      <ul className="flex flex-wrap gap-2" aria-label="Search filters">
        {card.chips.map((chip) => (
          <li key={chip} className="border border-navy bg-white px-3 py-1 text-body-sm text-navy">
            {chip}
          </li>
        ))}
      </ul>
      {card.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink">
          {card.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="text-caption text-muted">Check the filters before you run it. Nothing is saved: to get alerts, use &ldquo;Save search&rdquo; on the results.</p>
      <a href={card.href} className={`${linkBtn} bg-navy text-white hover:bg-navy-deep`}>
        Run this search
      </a>
    </div>
  );
}
