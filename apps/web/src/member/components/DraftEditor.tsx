"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mailtoHref } from "@vabrato/lib";
import { AIDraftLabel } from "@vabrato/ui/web";
import {
  deleteDraftAction,
  markDraftUsedAction,
  prepareAgentMessageAction,
  saveDraftAction,
  updateDraftAction,
} from "@/app/my/drafts/actions";
import { DRAFT_LIMITS, DRAFT_RECIPIENTS, type DraftKind, type Recipient } from "../assistant/kinds";

// A member's draft (S5b PR 3; mockup 11 "AI draft · You send it"): edit it,
// save it to My drafts, copy it, open it in their own email, or hand it to
// their agent as a portal message they still send. AI never sends. A cover
// letter goes to the agent only (owner decision 2026-11-14).

export interface DraftEditorProps {
  draftKind: DraftKind;
  recipient: Recipient;
  about: string | null;
  subject: string;
  body: string;
  /** Set for a saved draft (My drafts). */
  id?: string | null;
  /** "Opened in email on …" and the like, for a saved draft. */
  stamp?: string | null;
  heading: React.ReactNode;
}

const btn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";
const field =
  "mt-1 block w-full border border-muted bg-white px-3 text-body text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";

export function DraftEditor(props: DraftEditorProps) {
  const { draftKind, recipient, about, heading } = props;
  const uid = useId();
  const router = useRouter();
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [to, setTo] = useState("");
  const [id, setId] = useState<string | null>(props.id ?? null);
  const [saved, setSaved] = useState({ subject: props.subject, body: props.body });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const cover = draftKind === "cover_letter";
  const toAgent = cover || recipient === "agent";
  const changed = subject !== saved.subject || body !== saved.body;

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch {
        setMsg({ ok: false, text: "Something went wrong. Please try again." });
      }
    });

  const save = () =>
    run(async () => {
      const r = id
        ? await updateDraftAction(id, subject, body)
        : await saveDraftAction({ draftKind, recipient, about, subject, body });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (r.id) setId(r.id);
      setSaved({ subject, body });
      setMsg({ ok: true, text: r.message ?? "Saved." });
    });

  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body);
      if (id && !changed) await markDraftUsedAction(id, "copy");
      setMsg({ ok: true, text: "Copied. Paste it into your email or message." });
    });

  const sendToAgent = () =>
    run(async () => {
      const r = await prepareAgentMessageAction({
        draftKind,
        recipient,
        about,
        subject,
        body,
        id: changed ? null : id,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.push(r.href);
    });

  const remove = () => {
    if (!id || !window.confirm("Delete this draft?")) return;
    run(async () => {
      const r = await deleteDraftAction(id);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setGone(true);
      router.refresh();
    });
  };

  if (gone)
    return (
      <p role="status" className="font-body text-body-sm text-green">
        Draft deleted.
      </p>
    );

  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel variant="you-send" />
      {heading}
      <p className="text-caption text-muted">
        {cover ? "Offer cover letter, for your agent" : `For: ${DRAFT_RECIPIENTS[recipient]}`}
        {about ? ` · ${about}` : ""}
        {props.stamp ? ` · ${props.stamp}` : ""}
      </p>
      <div>
        <label htmlFor={`${uid}-s`} className="block font-medium">
          Subject
        </label>
        <input
          id={`${uid}-s`}
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, DRAFT_LIMITS.subject))}
          maxLength={DRAFT_LIMITS.subject}
          className={`${field} min-h-[44px]`}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-b`} className="block font-medium">
          {cover ? "Letter" : "Message"}
        </label>
        <textarea
          id={`${uid}-b`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, DRAFT_LIMITS.body))}
          maxLength={DRAFT_LIMITS.body}
          rows={10}
          aria-describedby={`${uid}-n`}
          className={`${field} py-2`}
        />
        <p id={`${uid}-n`} className="mt-1 text-caption text-muted">
          {body.length} of {DRAFT_LIMITS.body.toLocaleString("en-US")} characters. Check it and fill
          in anything in [brackets] before you send it.
        </p>
      </div>
      {!toAgent && (
        <div>
          <label htmlFor={`${uid}-to`} className="block font-medium">
            To (optional)
          </label>
          <p id={`${uid}-toh`} className="text-caption text-muted">
            Their email address, for &ldquo;Open in my email&rdquo;. It isn&apos;t sent to Ask
            Vabrato or saved.
          </p>
          <input
            id={`${uid}-to`}
            type="email"
            autoComplete="off"
            value={to}
            onChange={(e) => setTo(e.target.value.slice(0, 254))}
            aria-describedby={`${uid}-toh`}
            className={`${field} min-h-[44px] max-w-md`}
          />
        </div>
      )}
      {cover && (
        <p className="text-caption text-muted">
          Your agent reviews it before it goes with your offer. Cover letters are about your offer
          only (Fair Housing).
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {toAgent ? (
          <button
            type="button"
            onClick={sendToAgent}
            disabled={pending || !body.trim()}
            className={`${btn} bg-navy text-white hover:bg-navy-deep`}
          >
            Send to my agent
          </button>
        ) : (
          <a
            href={mailtoHref([to], subject, body)}
            onClick={() => {
              if (id && !changed) void markDraftUsedAction(id, "email");
            }}
            className={`${btn} bg-navy text-white hover:bg-navy-deep`}
          >
            Open in my email
          </a>
        )}
        {!cover && (
          <button
            type="button"
            onClick={copy}
            disabled={pending || !body.trim()}
            className={`${btn} border border-navy bg-white text-navy hover:bg-navy-50`}
          >
            Copy
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending || !body.trim() || (Boolean(id) && !changed)}
          className={`${btn} border border-navy bg-white text-navy hover:bg-navy-50`}
        >
          {id ? (changed ? "Save changes" : "Saved") : "Save to My drafts"}
        </button>
        {id && props.id && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={`${btn} border border-red bg-white text-red hover:bg-red/5`}
          >
            Delete
          </button>
        )}
      </div>
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={msg.ok ? "text-green" : "font-medium text-red"}
        >
          {msg.text}
          {msg.ok && id && !props.id && (
            <>
              {" "}
              <a href="/my/drafts" className="text-navy underline">
                Go to My drafts
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
