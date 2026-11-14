"use client";

import { useId, useState, useTransition } from "react";
import { fmtLong, planIcs } from "@vabrato/lib";
import { AIDraftLabel } from "@vabrato/ui/web";
import { addTodosAction } from "@/app/my/assistant/actions";
import { askMyAgentHref, type AskCard } from "../assistant/kinds";

// Answer cards for Ask Vabrato's schedules (S5b PR 5). Every date shown was
// worked out by our code; a seller's dates of record come from their agent's
// schedule and are shown as fixed. The member can add steps to their to-dos
// (their agent approves them) or download a calendar file. Nothing is kept.

type PlanCard = Extract<AskCard, { kind: "plan" }>;
type TourCard = Extract<AskCard, { kind: "tour" }>;

const btn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";

const NOTE = "Written by AI and can be wrong. Not legal or tax advice. Dates from your sale come from your agent's schedule; confirm anything important with your agent.";

function download(name: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PlanAnswer({ card, heading }: { card: PlanCard; heading: React.ReactNode }) {
  const uid = useId();
  const [picked, setPicked] = useState<boolean[]>(() => card.items.map(() => false));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const added = result?.ok === true;
  const source = card.planKind === "moving" ? "Moving plan" : "Pre-listing checklist";

  function add() {
    const todos = card.items.filter((_, i) => picked[i]).map((it) => ({ title: it.title, page: null, due_date: it.date }));
    if (!todos.length) return setResult({ ok: false, text: "Tick at least one step to add." });
    start(async () => {
      const r = await addTodosAction(source, todos).catch(() => ({ ok: false as const, error: "We couldn't add those. Please try again." }));
      setResult(r.ok ? { ok: true, text: `Added ${r.added} step${r.added === 1 ? "" : "s"} with their dates. Your agent approves them first; they're in My to-dos.` } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel />
      {heading}
      <p className="text-caption text-muted">
        {card.anchorLabel}: <span className="font-medium text-ink">{fmtLong(card.anchor)}</span>
      </p>
      {card.fixed.length > 0 && (
        <section aria-labelledby={`${uid}-fixed`} className="border-l-4 border-navy bg-white px-3 py-2">
          <h3 id={`${uid}-fixed`} className="font-medium">
            Dates from your sale (your agent&apos;s schedule)
          </h3>
          <ul className="mt-1 space-y-1">
            {card.fixed.map((f) => (
              <li key={`${f.label}-${f.date}`}>
                {f.label}: {fmtLong(f.date)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-caption text-muted">Ask Vabrato never changes these. Confirm them with your agent.</p>
        </section>
      )}
      <fieldset className="space-y-1" disabled={added || saving}>
        <legend className="font-medium">Steps</legend>
        {card.items.map((it, i) => (
          <label key={`${it.title}-${it.date}`} className="flex min-h-[44px] items-start gap-3 border-b border-line py-2 last:border-0">
            <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 h-5 w-5 flex-none accent-navy" />
            <span>
              <span className="font-medium">{it.title}</span>
              <span className="block text-caption text-muted">
                {it.asap ? "As soon as possible" : fmtLong(it.date)} · {it.category}
              </span>
              {it.detail && <span className="block">{it.detail}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      {card.dropped > 0 && <p className="text-caption text-muted">Some suggestions were left out because they named contract dates, costs or price opinions. Your agent handles those.</p>}
      {card.tips.length > 0 && (
        <ul className="list-disc space-y-1 pl-5" aria-label="Tips">
          {card.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        {!added && (
          <button type="button" onClick={add} disabled={saving} className={`${btn} bg-navy text-white hover:bg-navy-deep`}>
            Add to my to-dos
          </button>
        )}
        <button
          type="button"
          onClick={() => download(`${card.planKind === "moving" ? "moving-plan" : "pre-listing-checklist"}.ics`, planIcs({ name: source, items: card.items.map((it) => ({ title: it.title, date: it.date, detail: it.detail })) }))}
          className={`${btn} border border-navy bg-white text-navy hover:bg-navy-50`}
        >
          Download calendar (.ics)
        </button>
        <a href={askMyAgentHref(`Could you look over my ${source.toLowerCase()} for ${fmtLong(card.anchor)}?`)} className={`${btn} border border-navy bg-white text-navy hover:bg-navy-50`}>
          Ask my agent
        </a>
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-green" : "font-medium text-red"}>
          {result.text}
          {result.ok && (
            <>
              {" "}
              <a href="/my/todos" className="text-navy underline">
                Go to My to-dos
              </a>
            </>
          )}
        </p>
      )}
      <p className="text-caption text-muted">{NOTE}</p>
    </div>
  );
}

export function TourAnswer({ card, heading }: { card: TourCard; heading: React.ReactNode }) {
  const time = (t: string) => {
    const [h, m] = t.split(":").map(Number) as [number, number];
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel />
      {heading}
      {card.summary.length > 0 && (
        <div className="space-y-1">
          {card.summary.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
      )}
      <ol className="space-y-3" aria-label="Stops, in order">
        {card.stops.map((s, i) => (
          <li key={s.key} className="border border-line bg-white p-3">
            <p className="font-medium">
              {i + 1}. {s.label}
            </p>
            <p className="text-caption text-muted">
              {s.openHouse ? `Open house ${time(s.openHouse.start)}${s.openHouse.end ? `–${time(s.openHouse.end)}` : ""}` : "No open house that day"}
              {s.milesFromPrevious !== null ? ` · ${s.milesFromPrevious} mi from the stop before (straight line, not driving)` : ""}
              {s.broker ? ` · Listing broker: ${s.broker}` : ""}
            </p>
            {s.optedOut ? (
              <p className="mt-1">The seller asked that this listing not be used by AI tools, so there are no notes for it. Your agent can help.</p>
            ) : s.lookFor.length ? (
              <ul className="mt-1 list-disc pl-5" aria-label={`What to look at: ${s.label}`}>
                {s.lookFor.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
            {!s.openHouse && (
              <a href={`/listing/${encodeURIComponent(s.key)}/x#tour-heading`} className="mt-1 inline-flex min-h-[44px] items-center text-navy underline">
                Request a tour<span className="sr-only">: {s.label}</span>
              </a>
            )}
          </li>
        ))}
      </ol>
      {card.bring.length > 0 && (
        <p>
          <span className="font-medium">Bring:</span> {card.bring.join(", ")}.
        </p>
      )}
      <p className="text-caption text-muted">Order worked out by our code from open-house times and straight-line distance. Listing data: MLSListings. {NOTE}</p>
    </div>
  );
}
