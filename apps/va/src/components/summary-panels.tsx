"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { askAboutWorkAction, briefingAction, memberSummaryAction } from "@/lib/summary-actions";
import type { BriefingView, MemberSummaryView, QuestionView, SummaryResult } from "@/lib/summary-views";
import { btnSecondary, errorCls, inputCls, labelCls, mutedCls } from "./ui";

// S6b PR 4: the daily briefing, the member activity summary and questions
// about your work. Each is written on request from the person's own records
// and shown once; nothing is stored. Links come from our records, never
// from the assistant.

function useRequest<T>() {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  async function run(working: string, done: string, fn: () => Promise<SummaryResult<T>>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    // A new request replaces the last answer, so an old answer never sits under a new question.
    setView(null);
    setStatus(working);
    try {
      const r = await fn();
      if (r.ok) {
        setView(r.view);
        setStatus(done);
      } else {
        setStatus("");
        setError(r.error);
      }
    } catch {
      setStatus("");
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, view, error, status, run };
}

function Notices({ status, error }: { status: string; error: string | null }) {
  return (
    <>
      <p role="status" className="font-body text-body-sm font-medium text-ink">
        {status}
      </p>
      {error && (
        <p role="alert" className={errorCls}>
          {error}
        </p>
      )}
    </>
  );
}

const aiNote = "Written by the assistant from your records just now. Check anything important on its page; nothing here is saved.";

export function BriefingPanel() {
  const r = useRequest<BriefingView>();
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => void r.run("Writing your briefing…", "Briefing ready.", briefingAction)} disabled={r.busy} className={btnSecondary}>
        {r.busy ? "Writing…" : r.view ? "Write it again" : "Write my briefing"}
      </button>
      <Notices status={r.status} error={r.error} />
      {r.view && (
        <div className="space-y-4">
          <p className={mutedCls}>{aiNote}</p>
          <p className="font-body text-body-md font-medium text-ink">{r.view.headline}</p>
          {r.view.sections.map((sec, i) => (
            <section key={i} aria-label={sec.title}>
              <h3 className="font-body text-body-sm font-medium uppercase tracking-label text-muted">{sec.title}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-body-sm text-ink">
                {sec.items.map((item, j) => (
                  <li key={j}>
                    {item.href ? (
                      <Link href={item.href} className="text-navy underline">
                        {item.text}
                      </Link>
                    ) : (
                      item.text
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function MemberSummaryPanel({ memberId }: { memberId: string }) {
  const r = useRequest<MemberSummaryView>();
  return (
    <div className="space-y-4">
      <p className={mutedCls}>Reads their saved homes, searches, tour requests, homes they&apos;re pursuing and their last 10 messages. Nothing is saved, and the member isn&apos;t told.</p>
      <button type="button" onClick={() => void r.run("Reading their activity…", "Summary ready.", () => memberSummaryAction(memberId))} disabled={r.busy} className={btnSecondary}>
        {r.busy ? "Reading…" : r.view ? "Summarize again" : "Summarize activity"}
      </button>
      <Notices status={r.status} error={r.error} />
      {r.view && (
        <div className="space-y-3 font-body text-body-sm text-ink">
          <p className="border border-gold bg-gold-50 px-3 py-2 font-medium text-gold-ink">AI summary: check it against their activity below.</p>
          <p className="whitespace-pre-wrap">{r.view.summary}</p>
          {r.view.looking_for.length > 0 && (
            <section aria-label="What they seem to be looking for">
              <h3 className="font-medium">What they seem to be looking for</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {r.view.looking_for.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {r.view.next_steps.length > 0 && (
            <section aria-label="Suggested next steps">
              <h3 className="font-medium">Suggested next steps</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {r.view.next_steps.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkQuestionPanel() {
  const uid = useId();
  const [question, setQuestion] = useState("");
  const r = useRequest<QuestionView>();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${uid}-q`} className={labelCls}>
          Your question
        </label>
        <p id={`${uid}-hint`} className={`${mutedCls} mt-1`}>
          About your own transactions, tasks, leads and messages. For example: which of my deals close this month? Which leads have waited longest for a reply?
        </p>
        <textarea
          id={`${uid}-q`}
          aria-describedby={`${uid}-hint`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          rows={3}
          required
          disabled={r.busy}
          className={`${inputCls} mt-1`}
        />
      </div>
      <button
        type="button"
        onClick={() => (question.trim() ? void r.run("Looking through your records…", "Answer ready.", () => askAboutWorkAction(question)) : undefined)}
        disabled={r.busy || !question.trim()}
        className={btnSecondary}
      >
        {r.busy ? "Looking…" : "Ask"}
      </button>
      <Notices status={r.status} error={r.error} />
      {r.view && (
        <div className="space-y-3 font-body text-body-sm text-ink">
          <p className={mutedCls}>{aiNote}</p>
          <p className="whitespace-pre-wrap">{r.view.answer}</p>
          {r.view.notInData && <p className={mutedCls}>Your records here don&apos;t hold the answer to that.</p>}
          {r.view.sources.length > 0 && (
            <section aria-label="Based on">
              <h3 className="font-medium">Based on</h3>
              <ul className="mt-1 space-y-1">
                {r.view.sources.map((s, i) => (
                  <li key={i}>
                    <Link href={s.href} className="text-navy underline">
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
