"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { approveKitAction, discardKitAction, markKitUsedAction, saveKitAction, writeKitAction, writePresentationAction, type KitResult, type KitView } from "@/lib/kit-actions";
import { sendMarketToWebsiteAction, writeCmaWriteupAction, writeMarketUpdateAction } from "@/lib/market-cma-actions";
import { partsFor, type Parts } from "@/lib/kit-parts";
import { btnDanger, btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls } from "./ui";

// Launch kits and presentations (S6b PR 5): the agent edits every part the
// assistant wrote, approves it, then copies or prints it. Nothing is sent or
// published by the console. Fields are controlled, so an error never loses
// what was typed.

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

export interface EditorOptions {
  /** Where "Print" goes once approved; none for kinds that aren't printed on their own. */
  printHref?: string | null;
  /** Copy buttons per part once approved (launch kits; market updates once public_stats is on). */
  canCopy?: boolean;
  /** Market updates: "Send to website review" once approved and public_stats is on. */
  canSendToWebsite?: boolean;
  /** Shown once approved, instead of the usual note. */
  approvedNote?: string;
}

export function PartsEditor({ initial, onDiscarded, initialStatus = "", printHref = null, canCopy, canSendToWebsite = false, approvedNote }: { initial: KitView; onDiscarded?: () => void; initialStatus?: string } & EditorOptions) {
  const uid = useId();
  const [view, setView] = useState(initial);
  const [parts, setParts] = useState<Parts>(initial.parts);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const defs = partsFor(view.kind);
  const isKit = view.kind === "listing_kit";
  const copyable = canCopy ?? isKit;
  const approved = view.status === "approved";

  async function run(label: string, fn: () => Promise<KitResult>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      if (r.view) {
        setView(r.view);
        setParts(r.view.parts);
      }
      if (r.ok) {
        setStatus(r.message ?? "");
        if (r.view.status === "discarded") onDiscarded?.();
      } else {
        setStatus("");
        setError(r.error);
      }
    } catch {
      setStatus("");
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setStatus(`Copied: ${label}.`);
      await markKitUsedAction(view.id, "copy");
    } catch {
      setError("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink">
        <p className="font-medium">{approved ? "Approved by you" : "AI draft: check every part before you use it"}</p>
        <p className="mt-1">
          {approved
            ? (approvedNote ?? "It can't be changed now. Copy the parts you need, or print it.")
            : "The assistant wrote this from the facts we sent. Check each part against them and what you know, fix anything that isn't right, then approve it."}
        </p>
      </div>
      {defs.map((p) => {
        const id = `${uid}-${p.key}`;
        const value = parts[p.key] ?? "";
        if (approved && !value.trim()) return null;
        const common = {
          id,
          value,
          maxLength: p.max,
          readOnly: approved,
          onChange: (e: { target: { value: string } }) => setParts((cur) => ({ ...cur, [p.key]: e.target.value })),
          className: `${inputCls} mt-1`,
          ...(p.hint ? { "aria-describedby": `${id}-hint` } : {}),
        };
        return (
          <div key={p.key}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label htmlFor={id} className={labelCls}>
                {p.label}
              </label>
              {approved && copyable && (
                <button type="button" onClick={() => void copy(value, p.label)} className="font-body text-body-sm text-navy underline">
                  Copy<span className="sr-only"> {p.label}</span>
                </button>
              )}
            </div>
            {p.hint && (
              <p id={`${id}-hint`} className={`${mutedCls} mt-1`}>
                {p.hint}
              </p>
            )}
            {p.rows === 1 ? <input {...common} /> : <textarea {...common} rows={p.rows} />}
            {!approved && p.key === "mls_description" && <p className={`${mutedCls} mt-1`}>{value.length.toLocaleString("en-US")} of 1,000 characters</p>}
          </div>
        );
      })}

      {view.status === "draft" ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void run("approve", () => approveKitAction(view.id, parts))} disabled={Boolean(busy)} className={btnPrimary}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button type="button" onClick={() => void run("save", () => saveKitAction(view.id, parts))} disabled={Boolean(busy)} className={btnSecondary}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={() => void run("discard", () => discardKitAction(view.id))} disabled={Boolean(busy)} className={btnDanger}>
            Discard
          </button>
        </div>
      ) : approved && (printHref || (canSendToWebsite && view.sent_via !== "website")) ? (
        <div className="flex flex-wrap gap-3">
          {printHref && (
            <a href={printHref} onClick={() => void markKitUsedAction(view.id, "print")} className={btnPrimary}>
              {isKit ? "Print the flyer" : "Print or save as PDF"}
            </a>
          )}
          {canSendToWebsite && view.sent_via !== "website" && (
            <button type="button" onClick={() => void run("website", () => sendMarketToWebsiteAction(view.id))} disabled={Boolean(busy)} className={btnPrimary}>
              {busy === "website" ? "Sending…" : "Send to website review"}
            </button>
          )}
        </div>
      ) : null}
      <Notices status={status} error={error} />
    </div>
  );
}

/** The launch kit for one listing: write one, then edit and approve it. */
export function KitPanel({ listingKey, initial }: { listingKey: string; initial: KitView | null }) {
  const uid = useId();
  const [view, setView] = useState<KitView | null>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function write() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus("Writing the launch kit. This can take half a minute.");
    try {
      const r = await writeKitAction(listingKey, note);
      if (r.ok) {
        setView(r.view);
        setNote("");
        setStatus(r.message ?? "");
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

  if (view && view.status !== "discarded") {
    return (
      <div className="space-y-4">
        <PartsEditor key={view.id} initial={view} initialStatus={status} printHref={`/listings/${encodeURIComponent(listingKey)}/kit/${view.id}/flyer`} onDiscarded={() => setView(null)} />
        {view.status === "approved" && (
          <button
            type="button"
            onClick={() => {
              setView(null);
              setStatus("");
            }}
            className={btnSecondary}
          >
            Write another kit
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${uid}-note`} className={labelCls}>
          What should it highlight? (optional)
        </label>
        <p id={`${uid}-hint`} className={`${mutedCls} mt-1`}>
          For example: new roof in 2024, walk to the Caltrain station. Don&apos;t add lockbox codes, access details or contact numbers.
        </p>
        <textarea id={`${uid}-note`} aria-describedby={`${uid}-hint`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} disabled={busy} className={`${inputCls} mt-1`} />
      </div>
      <button type="button" onClick={() => void write()} disabled={busy} className={btnSecondary}>
        {busy ? "Writing…" : "Write launch kit"}
      </button>
      <Notices status={status} error={error} />
    </div>
  );
}

/** Write a market update or CMA summary, then edit and approve it. */
function WriteThenEdit({
  initial,
  noteLabel,
  noteHint,
  buttonLabel,
  working,
  write,
  options,
}: {
  initial: KitView | null;
  noteLabel: string;
  noteHint: string;
  buttonLabel: string;
  working: string;
  write: (note: string) => Promise<KitResult>;
  options: EditorOptions;
}) {
  const uid = useId();
  const [view, setView] = useState<KitView | null>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(working);
    try {
      const r = await write(note);
      if (r.ok) {
        setView(r.view);
        setNote("");
        setStatus(r.message ?? "");
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

  if (view && view.status !== "discarded") {
    return (
      <div className="space-y-4">
        <PartsEditor key={view.id} initial={view} initialStatus={status} onDiscarded={() => setView(null)} {...options} />
        {view.status === "approved" && (
          <button
            type="button"
            onClick={() => {
              setView(null);
              setStatus("");
            }}
            className={btnSecondary}
          >
            Write another
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${uid}-note`} className={labelCls}>
          {noteLabel}
        </label>
        <p id={`${uid}-hint`} className={`${mutedCls} mt-1`}>
          {noteHint}
        </p>
        <textarea id={`${uid}-note`} aria-describedby={`${uid}-hint`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} disabled={busy} className={`${inputCls} mt-1`} />
      </div>
      <button type="button" onClick={() => void go()} disabled={busy} className={btnSecondary}>
        {busy ? "Writing…" : buttonLabel}
      </button>
      <Notices status={status} error={error} />
    </div>
  );
}

const INTERNAL_PREVIEW = "Internal preview: market statistics can't leave the console until MLSListings confirms public use (the public_stats switch). Keep it as a draft for now.";

export function MarketUpdatePanel({ city, months, initial, publicStats }: { city: string; months: number; initial: KitView | null; publicStats: boolean }) {
  return (
    <WriteThenEdit
      initial={initial}
      noteLabel="Anything it should mention? (optional)"
      noteHint="For example: lead with how quickly homes are selling. It only uses the statistics on this page."
      buttonLabel="Write a market update"
      working="Writing the market update. This can take half a minute."
      write={(note) => writeMarketUpdateAction(city, months, note)}
      options={
        publicStats
          ? { canCopy: true, canSendToWebsite: true, approvedNote: "It can't be changed now. Copy it for an email or newsletter, or send it to Mark's website review." }
          : { canCopy: false, canSendToWebsite: false, approvedNote: INTERNAL_PREVIEW }
      }
    />
  );
}

export function CmaWriteupPanel({ cmaId, initial }: { cmaId: string; initial: KitView | null }) {
  return (
    <WriteThenEdit
      initial={initial}
      noteLabel="Anything it should point out? (optional)"
      noteHint="For example: the subject has a larger lot than most comparables. It only uses the comparables and range on this page."
      buttonLabel="Write a summary"
      working="Writing the summary. This can take half a minute."
      write={(note) => writeCmaWriteupAction(cmaId, note)}
      options={{ canCopy: true, approvedNote: "Approved. It shows on this CMA and its printout; copy it if you need it elsewhere." }}
    />
  );
}

/** Start a listing or buyer presentation, then open it. */
export function NewPresentationForm({ cmas = [] }: { cmas?: { id: string; title: string }[] }) {
  const uid = useId();
  const router = useRouter();
  const [kind, setKind] = useState<"listing_presentation" | "buyer_presentation">("listing_presentation");
  const [cmaId, setCmaId] = useState("");
  const [client, setClient] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function write() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus("Writing the presentation. This can take half a minute.");
    try {
      const r = await writePresentationAction({ kind, client, place, note, cmaId: kind === "listing_presentation" ? cmaId : "" });
      if (r.ok) {
        setStatus("Presentation ready. Opening it…");
        router.push(`/presentations/${r.id}`);
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

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className={labelCls}>Kind</legend>
        <div className="mt-2 flex flex-wrap gap-6 font-body text-body-sm text-ink">
          {(
            [
              ["listing_presentation", "Listing presentation (for a seller)"],
              ["buyer_presentation", "Buyer presentation"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-[44px] items-center gap-2">
              <input type="radio" name={`${uid}-kind`} value={value} checked={kind === value} onChange={() => setKind(value)} className="h-5 w-5" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-client`} className={labelCls}>
            Client&apos;s first name (optional)
          </label>
          <input id={`${uid}-client`} value={client} onChange={(e) => setClient(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={`${uid}-place`} className={labelCls}>
            {kind === "listing_presentation" ? "Their home's address and city (optional)" : "Where they're looking (optional)"}
          </label>
          <input id={`${uid}-place`} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} className={`${inputCls} mt-1`} />
        </div>
      </div>
      {kind === "listing_presentation" && cmas.length > 0 && (
        <div>
          <label htmlFor={`${uid}-cma`} className={labelCls}>
            Attach a CMA (optional)
          </label>
          <p id={`${uid}-cma-hint`} className={`${mutedCls} mt-1`}>
            Your CMAs with an approved summary. The printout adds the comparable sales, our range and the summary.
          </p>
          <select id={`${uid}-cma`} aria-describedby={`${uid}-cma-hint`} value={cmaId} onChange={(e) => setCmaId(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">No CMA</option>
            {cmas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`${uid}-note`} className={labelCls}>
          Anything it should cover? (optional)
        </label>
        <textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} disabled={busy} className={`${inputCls} mt-1`} />
      </div>
      <button type="button" onClick={() => void write()} disabled={busy} className={btnSecondary}>
        {busy ? "Writing…" : "Write presentation"}
      </button>
      <Notices status={status} error={error} />
    </div>
  );
}
