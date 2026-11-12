"use client";

import { useId, useState } from "react";
import {
  approveDraftAction,
  discardDraftAction,
  markDraftUsedAction,
  saveDraftAction,
  sendDraftAsMessageAction,
  writeDraftAction,
  type DraftResult,
  type DraftView,
  type WriteDraftInput,
} from "@/lib/draft-actions";
import { MAX_BODY, MAX_SUBJECT, SENT_VIA_LABEL, mailtoHref } from "@/lib/draft-kinds";
import { btnDanger, btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls } from "./ui";

// One AI draft, from asking to sending (S6b PR 3). The assistant writes;
// the person edits, approves, and sends it themselves: from their own email
// (a mailto: link to their mail app), by copying it, or as a portal message
// when the recipient has a member account. Nothing is sent by the console
// on its own. Fields are controlled, so an error never loses what was typed.

export interface VendorOption {
  id: string;
  name: string;
  role: string;
  email: string | null;
}

type Target = { target: "lead"; leadId: string } | { target: "escrow"; dealId: string } | { target: "vendor"; dealId: string };

export interface DraftPanelProps {
  heading: string;
  /** What the draft is for. */
  target: Target;
  /** The person's open draft for this lead or deal, if any. */
  initial: DraftView | null;
  /** Who "Open in email" addresses (from our records). Vendor drafts use the chosen vendor. */
  emailTo: string[];
  /** Whether the recipient has a member account for a portal message. */
  portal: boolean;
  /** Vendor quote requests: the vendors to choose from. */
  vendors?: VendorOption[];
  noteLabel: string;
  noteHint: string;
  /** Text to start the note with (S6b PR 7b: a trade's repair items). */
  initialNote?: string;
}

export function DraftPanel({ heading, target, initial, emailTo, portal, vendors, noteLabel, noteHint, initialNote }: DraftPanelProps) {
  const uid = useId();
  const [draft, setDraft] = useState<DraftView | null>(initial);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [vendorId, setVendorId] = useState(initial?.vendor_id ?? vendors?.[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isVendor = target.target === "vendor";
  const vendor = vendors?.find((v) => v.id === (draft?.vendor_id ?? vendorId));
  const to = isVendor ? (vendor?.email ? [vendor.email] : []) : emailTo;

  function show(r: DraftResult) {
    if (r.draft) {
      setDraft(r.draft);
      setSubject(r.draft.subject);
      setBody(r.draft.body);
    }
    if (r.ok) {
      setError(null);
      setStatus(r.message ?? "");
    } else {
      setStatus("");
      setError(r.error);
    }
  }

  async function run(label: string, fn: () => Promise<DraftResult>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      show(await fn());
    } catch {
      setStatus("");
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function write() {
    if (isVendor && !note.trim()) return setError("Say what you need from the vendor.");
    if (isVendor && !vendorId) return setError("Choose a vendor.");
    setStatus("Writing the draft. This takes a few seconds.");
    const input: WriteDraftInput = target.target === "vendor" ? { ...target, vendorId, note } : { ...target, note };
    void run("write", async () => {
      const r = await writeDraftAction(input);
      if (r.ok) setNote("");
      return r.ok ? { ...r, message: "Draft ready. Check it, edit it, then approve it." } : r;
    });
  }

  function startOver() {
    setDraft(null);
    setSubject("");
    setBody("");
    setStatus("");
    setError(null);
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body);
      setError(null);
      setStatus("Copied. Paste it into your email.");
      await markDraftUsedAction(draft.id, "copy");
    } catch {
      setError("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  const subjectId = `${uid}-subject`;
  const bodyId = `${uid}-body`;
  const noteId = `${uid}-note`;
  const noteHintId = `${uid}-note-hint`;

  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-4">
      <h3 id={`${uid}-h`} className="font-body text-body-md font-medium text-ink">
        {heading}
      </h3>

      {!draft || draft.status === "discarded" ? (
        <div className="space-y-3">
          {draft?.status === "discarded" && <p className={mutedCls}>The last draft was discarded. It&apos;s deleted after 30 days.</p>}
          {isVendor && (
            <div>
              <label htmlFor={`${uid}-vendor`} className={labelCls}>
                Vendor
              </label>
              {vendors && vendors.length > 0 ? (
                <select id={`${uid}-vendor`} value={vendorId} onChange={(e) => setVendorId(e.target.value)} disabled={Boolean(busy)} className={`${inputCls} mt-1`}>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.role})
                    </option>
                  ))}
                </select>
              ) : (
                <p className={`${mutedCls} mt-1`}>
                  No vendors yet. Add one on the <a href="/vendors" className="text-navy underline">Vendors</a> page.
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor={noteId} className={labelCls}>
              {noteLabel}
            </label>
            <p id={noteHintId} className={`${mutedCls} mt-1`}>
              {noteHint}
            </p>
            <textarea
              id={noteId}
              aria-describedby={noteHintId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              required={isVendor}
              disabled={Boolean(busy)}
              className={`${inputCls} mt-1`}
            />
          </div>
          <button type="button" onClick={write} disabled={Boolean(busy) || (isVendor && !vendors?.length)} className={btnSecondary}>
            {busy === "write" ? "Writing…" : "Write draft"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink">
            <p className="font-medium">{draft.status === "approved" ? "Approved by you" : "AI draft: check before you send"}</p>
            <p className="mt-1">
              {draft.status === "approved"
                ? `It's saved with this ${target.target === "lead" ? "lead" : "transaction"}. Send it yourself: nothing is sent until you do.${draft.sent_via ? ` You ${SENT_VIA_LABEL[draft.sent_via] ?? "used"} it.` : ""}`
                : "The assistant wrote this. Read every line, fix anything that isn't right, then approve it. Approving doesn't send it."}
            </p>
            {isVendor && vendor && <p className="mt-1">To: {vendor.name}. Add how to get into the property yourself; the assistant leaves access details out.</p>}
          </div>
          <div>
            <label htmlFor={subjectId} className={labelCls}>
              Subject
            </label>
            <input
              id={subjectId}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={MAX_SUBJECT}
              readOnly={draft.status !== "draft"}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label htmlFor={bodyId} className={labelCls}>
              Email
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_BODY}
              rows={12}
              readOnly={draft.status !== "draft"}
              required
              className={`${inputCls} mt-1 font-body leading-relaxed`}
            />
          </div>

          {draft.status === "draft" ? (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void run("approve", () => approveDraftAction(draft.id, { subject, body }))} disabled={Boolean(busy)} className={btnPrimary}>
                {busy === "approve" ? "Approving…" : "Approve"}
              </button>
              <button type="button" onClick={() => void run("save", () => saveDraftAction(draft.id, { subject, body }))} disabled={Boolean(busy)} className={btnSecondary}>
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={() => void run("discard", () => discardDraftAction(draft.id))} disabled={Boolean(busy)} className={btnDanger}>
                Discard
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <a href={mailtoHref(to, draft.subject, draft.body)} onClick={() => void markDraftUsedAction(draft.id, "email")} className={btnPrimary}>
                Open in email
              </a>
              <button type="button" onClick={() => void copy()} className={btnSecondary}>
                Copy
              </button>
              {portal && draft.sent_via !== "portal" && (
                <button type="button" onClick={() => void run("portal", () => sendDraftAsMessageAction(draft.id))} disabled={Boolean(busy)} className={btnSecondary}>
                  {busy === "portal" ? "Sending…" : "Send as portal message"}
                </button>
              )}
              <button type="button" onClick={startOver} className={btnSecondary}>
                Write another
              </button>
            </div>
          )}
          {draft.status === "approved" && to.length === 0 && <p className={mutedCls}>There&apos;s no email address on file, so add the recipient in your email.</p>}
        </div>
      )}

      <p role="status" className="font-body text-body-sm font-medium text-ink">
        {status}
      </p>
      {error && (
        <p role="alert" className={errorCls}>
          {error}
        </p>
      )}
    </section>
  );
}
