"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AIDraftLabel, SparkleIcon } from "@vabrato/ui/web";
import { Markdown } from "@vabrato/ui/markdown";
import { addTodosAction, askCompareAction, askCoverLetterAction, askDraftAction, askExplainAction, askFlyerAction, askListingAction, askMovingAction, askPaletteAction, askPrelistingAction, askSearchAction, askStagingAction, askSummarizeAction, askTourAction } from "@/app/my/assistant/actions";
import { ASK_LIMITS, DESIGN_LIMITS, DRAFT_LIMITS, DRAFT_RECIPIENTS, LISTING_QUESTION_MAX, PLAN_NOTES_MAX, PROMO_KINDS, ROOM_TYPES, askMyAgentHref, isPromoKind, isRecipient, isRoomType, type AskCard, type AskKind, type DesignKind, type DraftKind, type PromoKind, type Recipient, type RoomType } from "../assistant/kinds";
import { FlyerAnswer, PaletteAnswer, StagingAnswer } from "./DesignAnswers";
import { DraftEditor } from "./DraftEditor";
import { CompareAnswer, ListingAnswer } from "./ListingAnswers";
import { PlanAnswer, TourAnswer } from "./PlanAnswers";
import { pagesLabel } from "../assistant/summary";

// Ask Vabrato (mockup 11, S5b PRs 1-3). Answers stay in this page's memory
// only: leaving the page clears them (owner decision 2026-11-13). A draft is
// stored only if the member saves it (2026-11-14). No model code here; the
// actions run on the server.

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
  summarize: {
    label: "Summarize a document",
    field: "Which document",
    hint: "Up to 50 pages: PDFs, JPGs, PNGs or WebP images (not iPhone photos, HEIC). Pick from your documents.",
    button: "Summarize",
  },
  message: {
    label: "Draft an email or message",
    field: "What should it say?",
    hint: "For example: Ask the movers for a date the week after we close. Your notes and the home's address are sent; your name and contact details aren't.",
    button: "Write the draft",
  },
  cover_letter: {
    label: "Offer cover letter",
    field: "What makes your offer strong?",
    hint: "Price, timing, flexibility, preapproval. Leave out anything about your family, background, faith, age or health (Fair Housing).",
    button: "Write the letter",
  },
  compare: {
    label: "Compare homes",
    field: "Homes to compare",
    hint: "Pick 2 to 4 of your saved homes. Only the listing facts you can see are used; nothing about you is sent.",
    button: "Compare",
  },
  listing: {
    label: "Ask about a home",
    field: "Your question",
    hint: "For example: How big is the lot? Answers come from the listing only.",
    button: "Ask",
  },
  moving: {
    label: "Build my moving schedule",
    field: "Anything to plan around? (optional)",
    hint: "For example: a piano, two cats, a storage unit. Only the move day and these notes are sent.",
    button: "Build the plan",
  },
  prelisting: {
    label: "Pre-listing checklist",
    field: "Notes on the home (optional)",
    hint: "For example: old carpet in the den, a dripping faucet. No costs or prices are given.",
    button: "Build the checklist",
  },
  tour: {
    label: "Plan a tour day",
    field: "Homes to see",
    hint: "Pick 2 to 6 saved homes. Our code puts them in order (open houses first, then distance); Ask Vabrato adds what to look at.",
    button: "Plan the day",
  },
  palette: {
    label: "Colors and moodboard",
    field: "The room or the look you want",
    hint: "For example: a north-facing living room with oak floors; we want it warmer and calmer. Only these notes are sent.",
    button: "Make the palette",
  },
  staging: {
    label: "Staging ideas",
    field: "Describe the room",
    hint: "Size, light, furniture, what bothers you. No photos are sent; ideas are for planning only.",
    button: "Get ideas",
  },
  flyer: {
    label: "Open-house flyer and posts",
    field: "What do you love about your home?",
    hint: "Light, updates, the yard, the layout. Only your words are sent: your agent adds the address, price, photo and open-house time when they approve it.",
    button: "Write the flyer",
  },
};

const DESIGN_MAX: Record<DesignKind, number> = { palette: DESIGN_LIMITS.paletteNotes, staging: DESIGN_LIMITS.stagingNotes, flyer: DESIGN_LIMITS.flyerNotes };
const isDesign = (k: AskKind): k is DesignKind => k === "palette" || k === "staging" || k === "flyer";

const isPlan = (k: AskKind) => k === "moving" || k === "prelisting";

/** A home a listing mode can use: a saved or tracked home with an MLS listing. */
export interface ListingChoice {
  key: string;
  label: string;
}

export interface HomeChoice {
  /** "deal:<id>" or "tracked:<id>" */
  ref: string;
  label: string;
}

const isDraft = (k: AskKind): k is DraftKind => k === "message" || k === "cover_letter";

export interface DocOption {
  /** "upload:<id>" or "deal:<path>" */
  ref: string;
  label: string;
}

const selectCls =
  "mt-2 block min-h-[44px] w-full border border-muted bg-white px-3 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";

const linkBtn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function AskVabrato({
  kinds,
  left,
  limit,
  docs = [],
  initialDoc,
  homes = { message: [], cover_letter: [] },
  listingHomes = [],
  initialListing,
  sale = null,
  today,
  initialMode,
}: {
  kinds: AskKind[];
  left: number;
  limit: number;
  docs?: DocOption[];
  initialDoc?: string;
  homes?: Record<DraftKind, HomeChoice[]>;
  listingHomes?: ListingChoice[];
  /** ?listing=KEY: "Ask about a home" with this home chosen. */
  initialListing?: ListingChoice;
  /** The member's open sale, for a moving plan from their dates of record (S5b PR 5). */
  sale?: { label: string } | null;
  /** Today (Pacific), the earliest date a member may pick. */
  today?: string;
  /** ?mode=: a mode to start in. */
  initialMode?: AskKind;
}) {
  const startDoc = initialDoc && docs.some((d) => d.ref === initialDoc) ? initialDoc : undefined;
  const listingOptions = initialListing && !listingHomes.some((h) => h.key === initialListing.key) ? [initialListing, ...listingHomes] : listingHomes;
  const [mode, setMode] = useState<AskKind>(
    startDoc && kinds.includes("summarize") ? "summarize" : initialListing && kinds.includes("listing") ? "listing" : initialMode && kinds.includes(initialMode) ? initialMode : kinds[0]!,
  );
  const [movingSource, setMovingSource] = useState<"sale" | "date">(sale ? "sale" : "date");
  const [planDateValue, setPlanDateValue] = useState("");
  const [occupancy, setOccupancy] = useState<"occupied" | "vacant">("occupied");
  const [room, setRoom] = useState<RoomType>("living");
  const [promoKind, setPromoKind] = useState<PromoKind>("open_house");
  const [tourPicked, setTourPicked] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [listingKey, setListingKey] = useState(initialListing?.key ?? listingOptions[0]?.key ?? "");
  const [text, setText] = useState("");
  const [doc, setDoc] = useState(startDoc ?? docs[0]?.ref ?? "");
  const [recipient, setRecipient] = useState<Recipient>("movers");
  const [home, setHome] = useState("");
  const [letterHome, setLetterHome] = useState(homes.cover_letter[0]?.ref ?? "typed");
  const [typed, setTyped] = useState("");
  const [cards, setCards] = useState<(AskCard & { id: number })[]>([]);
  const [remaining, setRemaining] = useState(left);
  const [pending, start] = useTransition();
  const next = useRef(1);
  const newest = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const m = MODES[mode];
  const max = mode === "summarize" || mode === "compare" || mode === "tour" ? 0 : isDraft(mode) ? DRAFT_LIMITS.notes : mode === "listing" ? LISTING_QUESTION_MAX : isPlan(mode) ? PLAN_NOTES_MAX[mode as "moving" | "prelisting"] : isDesign(mode) ? DESIGN_MAX[mode] : ASK_LIMITS[mode as "explain" | "search"];
  const ready =
    mode === "summarize"
      ? Boolean(doc)
      : mode === "compare"
        ? picked.length >= 2 && picked.length <= 4
        : mode === "tour"
          ? tourPicked.length >= 2 && tourPicked.length <= 6 && Boolean(planDateValue)
          : mode === "moving"
            ? movingSource === "sale" || Boolean(planDateValue)
            : mode === "prelisting"
              ? Boolean(planDateValue)
        : mode === "listing"
          ? Boolean(listingKey && text.trim())
          : mode === "cover_letter" && letterHome === "typed"
            ? Boolean(text.trim() && typed.trim())
            : Boolean(text.trim());

  // Focus moves to each new answer, so it's read out once (not a live region).
  useEffect(() => newest.current?.focus(), [cards.length]);

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const question =
      mode === "summarize"
        ? `Summarize: ${docs.find((d) => d.ref === doc)?.label ?? "a document"}`
        : mode === "compare"
          ? `Compare ${picked.map((k) => listingHomes.find((h) => h.key === k)?.label ?? k).join(", ")}`
          : mode === "tour"
            ? `Tour day: ${tourPicked.map((k) => listingHomes.find((h) => h.key === k)?.label ?? k).join(", ")}`
            : mode === "moving"
              ? movingSource === "sale" && sale
                ? `Moving plan for ${sale.label}`
                : `Moving plan for ${planDateValue}`
              : mode === "prelisting"
                ? `Pre-listing checklist for ${planDateValue}`
                : mode === "staging"
                  ? `Staging ideas: ${ROOM_TYPES[room]}`
                  : mode === "flyer"
                    ? `${PROMO_KINDS[promoKind]} flyer and posts`
                    : text.trim();
    if (!ready || pending) return;
    start(async () => {
      let card: AskCard;
      try {
        card =
          mode === "explain"
            ? await askExplainAction(question)
            : mode === "search"
              ? await askSearchAction(question)
              : mode === "message"
                ? await askDraftAction({ recipient, home, notes: question })
                : mode === "cover_letter"
                  ? await askCoverLetterAction({ home: letterHome, typedAddress: typed, notes: question })
                  : mode === "compare"
                    ? await askCompareAction(picked)
                    : mode === "listing"
                      ? await askListingAction(listingKey, question)
                      : mode === "moving"
                        ? await askMovingAction({ source: movingSource, date: planDateValue, notes: text })
                        : mode === "prelisting"
                          ? await askPrelistingAction({ listDate: planDateValue, occupancy, notes: text })
                          : mode === "tour"
                            ? await askTourAction({ keys: tourPicked, date: planDateValue })
                            : mode === "palette"
                              ? await askPaletteAction({ notes: text })
                              : mode === "staging"
                                ? await askStagingAction({ room, notes: text })
                                : mode === "flyer"
                                  ? await askFlyerAction({ kind: promoKind, notes: text })
                                  : await askSummarizeAction(doc);
        if ((mode === "summarize" || mode === "compare" || mode === "tour" || isPlan(mode) || mode === "staging" || mode === "flyer") && card.kind === "error") card = { ...card, question };
      } catch {
        card = { kind: "error", feature: mode, question, message: "Something went wrong. Please try again." };
      }
      setCards((c) => [...c, { ...card, id: next.current++ }]);
      setRemaining((r) => Math.max(0, r - 1));
      if (card.kind !== "error" && mode !== "summarize" && mode !== "compare" && mode !== "tour") setText("");
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
        {mode === "summarize" ? (
          <div>
            <label htmlFor={`${uid}-doc`} className="block text-body-sm font-medium text-ink">
              {m.field}
            </label>
            <p id={`${uid}-hint`} className="mt-1 text-caption text-muted">
              {m.hint}
            </p>
            {docs.length ? (
              <select
                id={`${uid}-doc`}
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                aria-describedby={`${uid}-hint`}
                className="mt-2 block min-h-[44px] w-full max-w-xl border border-muted bg-white px-3 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy"
              >
                {docs.map((d) => (
                  <option key={d.ref} value={d.ref}>
                    {d.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-body-sm text-ink">
                You don&apos;t have a document Ask Vabrato can read yet.{" "}
                <a href="/my/documents" className="text-navy underline">
                  Upload one in Documents
                </a>
                .
              </p>
            )}
          </div>
        ) : mode === "tour" ? (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-body-sm font-medium text-ink">{m.field}</legend>
              <p id={`${uid}-thint`} className="mt-1 text-caption text-muted">
                {m.hint}
              </p>
              {listingHomes.length >= 2 ? (
                <div className="mt-2 space-y-1">
                  {listingHomes.map((h) => {
                    const on = tourPicked.includes(h.key);
                    return (
                      <label key={h.key} className="flex min-h-[44px] items-center gap-3 text-body-sm text-ink">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!on && tourPicked.length >= 6}
                          onChange={(e) => setTourPicked((p) => (e.target.checked ? [...p, h.key].slice(0, 6) : p.filter((k) => k !== h.key)))}
                          aria-describedby={`${uid}-thint`}
                          className="h-5 w-5 flex-none accent-navy"
                        />
                        {h.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-body-sm text-ink">Save at least two homes to plan a tour day.</p>
              )}
            </fieldset>
            <div>
              <label htmlFor={`${uid}-tdate`} className="block text-body-sm font-medium text-ink">
                Tour date
              </label>
              <input id={`${uid}-tdate`} type="date" min={today} value={planDateValue} onChange={(e) => setPlanDateValue(e.target.value)} className={`${selectCls} max-w-xs`} />
            </div>
          </div>
        ) : mode === "compare" ? (
          <fieldset>
            <legend className="text-body-sm font-medium text-ink">{m.field}</legend>
            <p id={`${uid}-chint`} className="mt-1 text-caption text-muted">
              {m.hint}
            </p>
            {listingHomes.length >= 2 ? (
              <div className="mt-2 space-y-1">
                {listingHomes.map((h) => {
                  const on = picked.includes(h.key);
                  return (
                    <label key={h.key} className="flex min-h-[44px] items-center gap-3 text-body-sm text-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && picked.length >= 4}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, h.key].slice(0, 4) : p.filter((k) => k !== h.key)))}
                        aria-describedby={`${uid}-chint`}
                        className="h-5 w-5 flex-none accent-navy"
                      />
                      {h.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-body-sm text-ink">
                Save at least two homes to compare them.{" "}
                <a href="/search" className="text-navy underline">
                  Search homes
                </a>
                .
              </p>
            )}
          </fieldset>
        ) : (
          <div className="space-y-4">
            {mode === "moving" && (
              <fieldset>
                <legend className="text-body-sm font-medium text-ink">Plan from</legend>
                <div className="mt-2 space-y-1 text-body-sm text-ink">
                  {sale && (
                    <label className="flex min-h-[44px] items-center gap-3">
                      <input type="radio" name={`${uid}-msrc`} checked={movingSource === "sale"} onChange={() => setMovingSource("sale")} className="h-5 w-5 accent-navy" />
                      My sale&apos;s dates ({sale.label}, from my agent&apos;s schedule)
                    </label>
                  )}
                  <label className="flex min-h-[44px] items-center gap-3">
                    <input type="radio" name={`${uid}-msrc`} checked={movingSource === "date"} onChange={() => setMovingSource("date")} className="h-5 w-5 accent-navy" />
                    A move date I choose
                  </label>
                </div>
                {movingSource === "date" && (
                  <div className="mt-2">
                    <label htmlFor={`${uid}-mdate`} className="block text-body-sm font-medium text-ink">
                      Move date
                    </label>
                    <input id={`${uid}-mdate`} type="date" min={today} value={planDateValue} onChange={(e) => setPlanDateValue(e.target.value)} className={`${selectCls} max-w-xs`} />
                  </div>
                )}
              </fieldset>
            )}
            {mode === "prelisting" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-ldate`} className="block text-body-sm font-medium text-ink">
                    Target list date
                  </label>
                  <input id={`${uid}-ldate`} type="date" min={today} value={planDateValue} onChange={(e) => setPlanDateValue(e.target.value)} className={selectCls} />
                </div>
                <div>
                  <label htmlFor={`${uid}-occ`} className="block text-body-sm font-medium text-ink">
                    The home is
                  </label>
                  <select id={`${uid}-occ`} value={occupancy} onChange={(e) => setOccupancy(e.target.value === "vacant" ? "vacant" : "occupied")} className={selectCls}>
                    <option value="occupied">Lived in</option>
                    <option value="vacant">Empty</option>
                  </select>
                </div>
              </div>
            )}
            {mode === "staging" && (
              <div>
                <label htmlFor={`${uid}-room`} className="block text-body-sm font-medium text-ink">
                  Which room
                </label>
                <select id={`${uid}-room`} value={room} onChange={(e) => isRoomType(e.target.value) && setRoom(e.target.value)} className={`${selectCls} max-w-xs`}>
                  {Object.entries(ROOM_TYPES).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "flyer" && (
              <div>
                <label htmlFor={`${uid}-pkind`} className="block text-body-sm font-medium text-ink">
                  The flyer is for
                </label>
                <select id={`${uid}-pkind`} value={promoKind} onChange={(e) => isPromoKind(e.target.value) && setPromoKind(e.target.value)} className={`${selectCls} max-w-xs`}>
                  {Object.entries(PROMO_KINDS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "listing" && (
              <div>
                <label htmlFor={`${uid}-listing`} className="block text-body-sm font-medium text-ink">
                  Which home
                </label>
                {listingOptions.length ? (
                  <select id={`${uid}-listing`} value={listingKey} onChange={(e) => setListingKey(e.target.value)} className={`${selectCls} max-w-xl`}>
                    {listingOptions.map((h) => (
                      <option key={h.key} value={h.key}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-body-sm text-ink">
                    Save a home first, or open one and choose &ldquo;Ask Vabrato about this home&rdquo;.
                  </p>
                )}
              </div>
            )}
            {mode === "message" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-to`} className="block text-body-sm font-medium text-ink">
                    Who it&apos;s for
                  </label>
                  <select id={`${uid}-to`} value={recipient} onChange={(e) => isRecipient(e.target.value) && setRecipient(e.target.value)} className={selectCls}>
                    {Object.entries(DRAFT_RECIPIENTS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-home`} className="block text-body-sm font-medium text-ink">
                    Which home
                  </label>
                  <select id={`${uid}-home`} value={home} onChange={(e) => setHome(e.target.value)} className={selectCls}>
                    <option value="">Not about a particular home</option>
                    {homes.message.map((h) => (
                      <option key={h.ref} value={h.ref}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {mode === "cover_letter" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-lhome`} className="block text-body-sm font-medium text-ink">
                    The home you&apos;re offering on
                  </label>
                  <select id={`${uid}-lhome`} value={letterHome} onChange={(e) => setLetterHome(e.target.value)} className={selectCls}>
                    {homes.cover_letter.map((h) => (
                      <option key={h.ref} value={h.ref}>
                        {h.label}
                      </option>
                    ))}
                    <option value="typed">Another address (type it)</option>
                  </select>
                </div>
                {letterHome === "typed" && (
                  <div>
                    <label htmlFor={`${uid}-addr`} className="block text-body-sm font-medium text-ink">
                      Address
                    </label>
                    <input
                      id={`${uid}-addr`}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value.slice(0, DRAFT_LIMITS.about))}
                      maxLength={DRAFT_LIMITS.about}
                      required
                      autoComplete="off"
                      className="mt-2 block min-h-[44px] w-full border border-muted bg-white px-3 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy"
                    />
                  </div>
                )}
              </div>
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
              rows={isDraft(mode) || isPlan(mode) || isDesign(mode) ? 5 : 3}
              required={!isPlan(mode)}
              aria-describedby={`${uid}-hint ${uid}-count`}
              className="mt-2 block w-full border border-muted bg-white px-3 py-2 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy"
            />
            <p id={`${uid}-count`} className="mt-1 text-caption text-muted">
              {text.length} of {max} characters
            </p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending || !ready || remaining === 0}
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
              {mode === "summarize" ? "Reading the document…" : "Writing…"}
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
  if (card.kind === "summary") return <SummaryAnswer card={card} heading={heading} />;
  if (card.kind === "plan") return <PlanAnswer card={card} heading={heading(card.planKind === "moving" ? "Your moving plan" : "Your pre-listing checklist")} />;
  if (card.kind === "tour") return <TourAnswer card={card} heading={heading("Your tour day")} />;
  if (card.kind === "palette") return <PaletteAnswer card={card} heading={heading("Your palette")} />;
  if (card.kind === "staging") return <StagingAnswer card={card} heading={heading(`Staging ideas: ${ROOM_TYPES[card.room]}`)} />;
  if (card.kind === "flyer") return <FlyerAnswer card={card} heading={heading("Your flyer and posts")} />;
  if (card.kind === "compare") return <CompareAnswer card={card} heading={heading(`Comparing ${card.homes.length + card.excluded.length} homes`)} />;
  if (card.kind === "listing") return <ListingAnswer card={card} heading={heading("About this home")} />;
  if (card.kind === "draft")
    return (
      <DraftEditor
        draftKind={card.draftKind}
        recipient={card.recipient}
        about={card.about}
        subject={card.subject}
        body={card.body}
        heading={heading(card.draftKind === "cover_letter" ? "Your cover letter" : "Your draft")}
      />
    );
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

type SummaryCard = Extract<AskCard, { kind: "summary" }>;

function SummaryAnswer({ card, heading }: { card: SummaryCard; heading: (text: string) => React.ReactNode }) {
  const uid = useId();
  const [picked, setPicked] = useState<boolean[]>(() => card.todos.map(() => false));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const added = result?.ok === true;
  const ref = (pages: number[]) => (pages.length ? <span className="text-muted"> ({pagesLabel(pages)})</span> : null);

  function add() {
    const todos = card.todos.filter((_, i) => picked[i]);
    if (!todos.length) return setResult({ ok: false, text: "Tick at least one to-do to add." });
    start(async () => {
      const r = await addTodosAction(card.docName, todos).catch(() => ({ ok: false as const, error: "We couldn't add those. Please try again." }));
      setResult(r.ok ? { ok: true, text: `Added ${r.added} to-do${r.added === 1 ? "" : "s"}. Your agent approves them first; they're in My to-dos.` } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="space-y-5 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel />
      {heading(`Summary of ${card.docName}${card.pages ? ` (${card.pages} page${card.pages === 1 ? "" : "s"})` : ""}`)}
      {card.docKind && <p className="text-caption text-muted">It looks like: {card.docKind}</p>}
      <ul className="list-disc space-y-2 pl-5">
        {card.points.map((p, i) => (
          <li key={i}>
            {p.text}
            {ref(p.pages)}
          </li>
        ))}
      </ul>
      {card.questions.length > 0 && (
        <section aria-labelledby={`${uid}-q`} className="space-y-2">
          <h3 id={`${uid}-q`} className="font-medium">
            Questions to ask
          </h3>
          <ul className="space-y-2">
            {card.questions.map((q, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>
                  {q.text}
                  {ref(q.pages)}
                </span>
                <a href={askMyAgentHref(q.text)} className="inline-flex min-h-[44px] items-center px-2 text-navy underline">
                  Ask my agent<span className="sr-only">: {q.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {card.todos.length > 0 && (
        <fieldset className="space-y-2" disabled={added || saving}>
          <legend className="font-medium">Suggested to-dos</legend>
          <p className="text-caption text-muted">Tick the ones you want. Your agent sees and approves to-dos you add.</p>
          {card.todos.map((t, i) => (
            <label key={i} className="flex min-h-[44px] items-start gap-3 py-1">
              <input
                type="checkbox"
                checked={picked[i] ?? false}
                onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-1 h-5 w-5 flex-none accent-navy"
              />
              <span>
                {t.title}
                {t.page ? <span className="text-muted"> (p. {t.page})</span> : null}
              </span>
            </label>
          ))}
          {!added && (
            <button type="button" onClick={add} className={`${linkBtn} bg-navy text-white hover:bg-navy-deep disabled:opacity-60`}>
              Add to my to-dos
            </button>
          )}
        </fieldset>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-green" : "font-medium text-red"}>
          {result.text}
          {result.ok && (
            <>
              {" "}
              <a href="/my/todos" className="text-navy underline">
                Open My to-dos
              </a>
            </>
          )}
        </p>
      )}
      <p className="text-caption text-muted">Written by AI from your document and can be wrong. Not legal, engineering or tax advice. Your agent sees to-dos you add, not this summary.</p>
    </div>
  );
}
