"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AIConceptBadge, AIDraftLabel } from "@vabrato/ui/web";
import { addTodosAction, sendFlyerAction } from "@/app/my/assistant/actions";
import { DESIGN_LIMITS, PROMO_KINDS, ROOM_TYPES, askMyAgentHref, type AskCard, type PaletteColor } from "../assistant/kinds";
import { moodboardSvg, paletteSvg, svgDataUrl } from "../design-svg";
import { downloadPng, downloadSvg } from "./svg-download";

// Answer cards for Ask Vabrato's design features (S5b PR 6). Every swatch and
// tile is drawn by our own template from checked colors; the model's words are
// shown as plain text. Colors and staging ideas aren't kept; a flyer is kept
// only when the seller sends it to their agent for approval.

type PaletteCard = Extract<AskCard, { kind: "palette" }>;
type StagingCard = Extract<AskCard, { kind: "staging" }>;
type FlyerCard = Extract<AskCard, { kind: "flyer" }>;

const btn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";
const primary = `${btn} bg-navy text-white hover:bg-navy-deep`;
const secondary = `${btn} border border-navy bg-white text-navy hover:bg-navy-50`;
const field = "mt-1 block w-full border border-muted bg-white px-3 py-2 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";

const CONCEPT_NOTE = "AI concept for planning only. Screen colors vary: test a sample on the wall first. Listing photos must always show the real home.";

function ColorList({ colors, label }: { colors: PaletteColor[]; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {colors.map((c) => (
        <li key={c.hex} className="flex items-center gap-3">
          <span aria-hidden="true" className="h-8 w-8 flex-none border border-line" style={{ backgroundColor: c.hex }} />
          <span>
            <span className="font-medium">{c.name}</span> <span className="text-muted">{c.hex}</span> · {c.use}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Drawn({ svg, alt }: { svg: string; alt: string }) {
  // Our own SVG, shown as an image: it can't run anything.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUrl(svg)} alt={alt} className="h-auto w-full max-w-2xl border border-line bg-white" />;
}

export function PaletteAnswer({ card, heading }: { card: PaletteCard; heading: React.ReactNode }) {
  const pal = useMemo(() => paletteSvg(card.name, card.colors), [card]);
  const mood = useMemo(() => (card.tiles.length ? moodboardSvg(card.name, card.tiles) : null), [card]);
  const [err, setErr] = useState<string | null>(null);
  const file = card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "palette";
  const png = (name: string, svg: string) => downloadPng(name, svg).catch(() => setErr("The image couldn't be made. Try the SVG instead."));
  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <div className="flex flex-wrap gap-2">
        <AIDraftLabel />
        <AIConceptBadge label="for planning only" />
      </div>
      {heading}
      <p className="font-medium">{card.name}</p>
      <Drawn svg={pal} alt={`Palette swatches: ${card.colors.map((c) => `${c.name} (${c.hex}, ${c.use})`).join(", ")}`} />
      <ColorList colors={card.colors} label="Palette colors" />
      {mood && (
        <>
          <h3 className="font-medium">Moodboard</h3>
          <Drawn svg={mood} alt={`Moodboard tiles: ${card.tiles.map((t) => `${t.label} (${t.kind})`).join(", ")}`} />
        </>
      )}
      {card.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {card.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {card.dropped > 0 && <p className="text-caption text-muted">Some colors or tiles weren&apos;t usable and were left out.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => downloadSvg(`${file}.svg`, pal)}>
          Download SVG
        </button>
        <button type="button" className={secondary} onClick={() => png(`${file}.png`, pal)}>
          Download PNG
        </button>
        {mood && (
          <button type="button" className={secondary} onClick={() => png(`${file}-moodboard.png`, mood)}>
            Download moodboard
          </button>
        )}
        <a href={askMyAgentHref(`What do you think of this palette: ${card.colors.map((c) => `${c.name} ${c.hex}`).join(", ")}?`)} className={secondary}>
          Ask my agent
        </a>
      </div>
      {err && (
        <p role="alert" className="font-medium text-red">
          {err}
        </p>
      )}
      <p className="text-caption text-muted">{CONCEPT_NOTE}</p>
    </div>
  );
}

export function StagingAnswer({ card, heading }: { card: StagingCard; heading: React.ReactNode }) {
  const uid = useId();
  const [picked, setPicked] = useState<boolean[]>(() => card.todos.map(() => false));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const added = result?.ok === true;
  const sections = [
    ["Keep", card.keep],
    ["Remove or store", card.remove],
    ["Bring in", card.add],
    ["Arrange", card.arrange],
  ] as const;

  function add() {
    const todos = card.todos.filter((_, i) => picked[i]).map((t) => ({ title: t.title, page: null }));
    if (!todos.length) return setResult({ ok: false, text: "Tick at least one to-do to add." });
    start(async () => {
      const r = await addTodosAction(`Staging ideas: ${ROOM_TYPES[card.room]}`, todos).catch(() => ({ ok: false as const, error: "We couldn't add those. Please try again." }));
      setResult(r.ok ? { ok: true, text: `Added ${r.added} to-do${r.added === 1 ? "" : "s"}. Your agent approves them first; they're in My to-dos.` } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <div className="flex flex-wrap gap-2">
        <AIDraftLabel />
        <AIConceptBadge label="ideas for planning" />
      </div>
      {heading}
      {card.summary && <p>{card.summary}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {sections
          .filter(([, items]) => items.length)
          .map(([title, items]) => (
            <section key={title} aria-labelledby={`${uid}-${title}`}>
              <h3 id={`${uid}-${title}`} className="font-medium">
                {title}
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          ))}
      </div>
      {card.palette.length > 0 && (
        <section aria-labelledby={`${uid}-pal`} className="space-y-2">
          <h3 id={`${uid}-pal`} className="font-medium">
            Accent colors
          </h3>
          <ColorList colors={card.palette} label="Accent colors" />
        </section>
      )}
      {card.todos.length > 0 && (
        <fieldset className="space-y-2" disabled={added || saving}>
          <legend className="font-medium">Suggested to-dos</legend>
          <p className="text-caption text-muted">Tick the ones you want. Your agent sees and approves to-dos you add.</p>
          {card.todos.map((t, i) => (
            <label key={i} className="flex min-h-[44px] items-start gap-3 py-1">
              <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 h-5 w-5 flex-none accent-navy" />
              <span>
                {t.title}
                {t.detail && <span className="block text-muted">{t.detail}</span>}
              </span>
            </label>
          ))}
          {!added && (
            <button type="button" onClick={add} className={primary}>
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
      {card.dropped > 0 && <p className="text-caption text-muted">Some ideas mentioned costs or value and were left out. Your agent can help with those.</p>}
      <a href={askMyAgentHref(`I'm staging the ${ROOM_TYPES[card.room].toLowerCase()}. Could we talk about it?`)} className={secondary}>
        Ask my agent
      </a>
      <p className="text-caption text-muted">Written by AI and can be wrong. Ideas for planning only: listing photos must show the real home. Check bigger changes with your agent.</p>
    </div>
  );
}

export function FlyerAnswer({ card, heading }: { card: FlyerCard; heading: React.ReactNode }) {
  const uid = useId();
  const [headline, setHeadline] = useState(card.headline);
  const [highlights, setHighlights] = useState(card.highlights.join("\n"));
  const [blurb, setBlurb] = useState(card.blurb);
  const [instagram, setInstagram] = useState(card.instagram);
  const [facebook, setFacebook] = useState(card.facebook);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, start] = useTransition();
  const sent = result?.ok === true;

  function send() {
    start(async () => {
      const r = await sendFlyerAction({ kind: card.promoKind, headline, highlights, blurb, instagram, facebook }).catch(() => ({ ok: false as const, error: "We couldn't send that. Please try again." }));
      setResult(r.ok ? { ok: true, text: "Sent to your agent. They approve it and add your listing, the open-house time and their details." } : { ok: false, text: r.error });
    });
  }

  const box = (id: string, label: string, value: string, set: (v: string) => void, max: number, rows: number, hint?: string) => (
    <div>
      <label htmlFor={`${uid}-${id}`} className="block font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${uid}-${id}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      )}
      <textarea
        id={`${uid}-${id}`}
        value={value}
        onChange={(e) => set(e.target.value.slice(0, max))}
        maxLength={max}
        rows={rows}
        aria-describedby={hint ? `${uid}-${id}-hint` : undefined}
        className={field}
      />
    </div>
  );

  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel variant="suggested" />
      {heading}
      <p className="text-caption text-muted">
        {PROMO_KINDS[card.promoKind]}. Edit anything, then send it to your agent. They approve it and add your listing&apos;s address, price, photo, the open-house time and
        their details from our records.
      </p>
      <fieldset className="space-y-3" disabled={sent || sending}>
        <legend className="sr-only">Flyer and posts</legend>
        <div>
          <label htmlFor={`${uid}-headline`} className="block font-medium">
            Headline
          </label>
          <input id={`${uid}-headline`} value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, DESIGN_LIMITS.headline))} maxLength={DESIGN_LIMITS.headline} className={`${field} min-h-[44px]`} />
        </div>
        {box("highlights", "Highlights", highlights, setHighlights, 600, 5, `One per line, up to ${DESIGN_LIMITS.highlights}.`)}
        {box("blurb", "About the home", blurb, setBlurb, DESIGN_LIMITS.blurb, 3)}
        {box("instagram", "Instagram post", instagram, setInstagram, DESIGN_LIMITS.instagram, 4)}
        {box("facebook", "Facebook post", facebook, setFacebook, DESIGN_LIMITS.facebook, 4)}
        {!sent && (
          <button type="button" onClick={send} className={primary}>
            Send to my agent for approval
          </button>
        )}
      </fieldset>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-green" : "font-medium text-red"}>
          {result.text}
          {result.ok && (
            <>
              {" "}
              <Link href="/my/flyers" className="text-navy underline">
                Open My flyers
              </Link>
            </>
          )}
        </p>
      )}
      <p className="text-caption text-muted">Written by AI from your words and can be wrong. Nothing is posted for you: once approved, you copy the posts and print the flyer yourself.</p>
    </div>
  );
}
