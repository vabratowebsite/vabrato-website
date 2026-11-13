"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { APPT_LIMITS, APPT_LINES, LENGTH_CHOICES, lengthText, validDate, validTime, whenText, type AppointmentFields } from "@/lib/appointment-kinds";
import { approveAppointmentAction, markAppointmentUsedAction, saveAppointmentAction, type AppointmentResult, type AppointmentView } from "@/lib/call-actions";
import { discardDraftAction } from "@/lib/draft-actions";
import { MAX_BODY, MAX_SUBJECT, mailtoHref } from "@/lib/draft-kinds";
import { btnDanger, btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls } from "./ui";

// One appointment draft (S6b PR 8): the fields the assistant proposed (our
// code checked them; blanks are for the person to fill), and the
// confirmation. Approving checks it all again; then the calendar file and
// the confirmation are ready. The console books and sends nothing.

const MAILTO_MAX = 1800;
/** A date and time as whenText writes it: "Tuesday, November 17 at 3:00 PM". */
const WHEN_PHRASE = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2} at \d{1,2}:\d{2} [AP]M\b/g;

export function AppointmentEditor({ initial, emailTo, backHref }: { initial: AppointmentView; emailTo: string[]; backHref: string }) {
  const uid = useId();
  const router = useRouter();
  const [appt, setAppt] = useState(initial);
  const [fields, setFields] = useState<AppointmentFields>(initial.fields);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draft = appt.status === "draft";
  const newWhen = validDate(fields.date) && validTime(fields.start) ? whenText(fields.date, fields.start) : null;

  const set = <K extends keyof AppointmentFields>(k: K, v: AppointmentFields[K]) => setFields((f) => ({ ...f, [k]: v }));

  async function run(label: string, fn: () => Promise<AppointmentResult>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      if (r.appointment) {
        setAppt(r.appointment);
        setFields(r.appointment.fields);
        setSubject(r.appointment.subject);
        setBody(r.appointment.body);
      }
      if (r.ok) setStatus(r.message);
      else {
        setStatus("");
        setError(r.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  /** Puts the new date and time wherever a date and time (or [when]) is in the confirmation. */
  function updateWhen() {
    if (!newWhen) return;
    const swap = (s: string) => s.replaceAll("[when]", newWhen).replace(WHEN_PHRASE, newWhen);
    setSubject(swap(subject));
    setBody(swap(body));
    setStatus(`The confirmation now says "${newWhen}". Save or approve to keep it.`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(appt.subject ? `${appt.subject}\n\n${appt.body}` : appt.body);
      setError(null);
      setStatus("Copied. Paste it into your email or message.");
      await markAppointmentUsedAction(appt.id, "copy");
    } catch {
      setError("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  const mailto = mailtoHref(emailTo, appt.subject, appt.body);
  const id = (k: string) => `${uid}-${k}`;

  return (
    <div className="space-y-4">
      <div className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink print:hidden">
        <p className="font-medium">{draft ? "AI draft: check before you approve" : "Approved"}</p>
        <p className="mt-1">{draft ? "The assistant proposed this from your sentence. Check every field; blanks are ones it couldn't tell or that weren't possible. " : ""}{APPT_LINES.noBooking}</p>
      </div>

      <fieldset className="grid gap-4 border border-line p-4 sm:grid-cols-2" disabled={!draft || Boolean(busy)}>
        <legend className="px-1 font-body text-body-sm font-medium text-ink">Appointment</legend>
        <div className="sm:col-span-2">
          <label htmlFor={id("title")} className={labelCls}>
            What
          </label>
          <input id={id("title")} value={fields.title} onChange={(e) => set("title", e.target.value)} maxLength={APPT_LIMITS.title} className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={id("date")} className={labelCls}>
            Date
          </label>
          <input id={id("date")} type="date" value={fields.date} onChange={(e) => set("date", e.target.value)} className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={id("start")} className={labelCls}>
            Start (California time)
          </label>
          <input id={id("start")} type="time" step={300} min={APPT_LIMITS.firstTime} max={APPT_LIMITS.lastTime} value={fields.start} onChange={(e) => set("start", e.target.value)} className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={id("len")} className={labelCls}>
            Length
          </label>
          <select id={id("len")} value={fields.minutes ?? ""} onChange={(e) => set("minutes", e.target.value ? Number(e.target.value) : null)} className={`${inputCls} mt-1`}>
            <option value="">Choose</option>
            {[...new Set([...LENGTH_CHOICES, ...(fields.minutes ? [fields.minutes] : [])])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {lengthText(m)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("with")} className={labelCls}>
            With
          </label>
          <input id={id("with")} value={fields.with} onChange={(e) => set("with", e.target.value)} maxLength={APPT_LIMITS.with} className={`${inputCls} mt-1`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id("loc")} className={labelCls}>
            Where
          </label>
          <input id={id("loc")} value={fields.location} onChange={(e) => set("location", e.target.value)} maxLength={APPT_LIMITS.location} className={`${inputCls} mt-1`} />
        </div>
      </fieldset>

      {draft && newWhen && !body.includes(newWhen) && (
        <div className="flex flex-wrap items-center gap-3 border border-line p-3 font-body text-body-sm text-ink">
          <p>The confirmation doesn&apos;t say &ldquo;{newWhen}&rdquo; yet.</p>
          <button type="button" onClick={updateWhen} className={btnSecondary}>
            Put the date and time in the email
          </button>
        </div>
      )}

      <div>
        <label htmlFor={id("subject")} className={labelCls}>
          Confirmation subject
        </label>
        <input id={id("subject")} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} readOnly={!draft} className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={id("body")} className={labelCls}>
          Confirmation
        </label>
        <textarea id={id("body")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_BODY} rows={10} readOnly={!draft} className={`${inputCls} mt-1 leading-relaxed`} />
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        {draft ? (
          <>
            <button type="button" onClick={() => void run("approve", () => approveAppointmentAction(appt.id, fields, { subject, body }))} disabled={Boolean(busy)} className={btnPrimary}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button type="button" onClick={() => void run("save", () => saveAppointmentAction(appt.id, fields, { subject, body }))} disabled={Boolean(busy)} className={btnSecondary}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              className={btnDanger}
              onClick={async () => {
                if (!window.confirm("Discard this appointment draft?")) return;
                const r = await discardDraftAction(appt.id);
                if (r.ok) router.push(backHref);
                else setError(r.error);
              }}
            >
              Discard
            </button>
          </>
        ) : appt.status === "approved" ? (
          <>
            <a href={`/appointments/${appt.id}/ics`} download className={btnPrimary}>
              Add to calendar (.ics)
            </a>
            {mailto.length <= MAILTO_MAX ? (
              <a href={mailto} onClick={() => void markAppointmentUsedAction(appt.id, "email")} className={btnSecondary}>
                Open in email
              </a>
            ) : null}
            <button type="button" onClick={() => void copy()} className={btnSecondary}>
              Copy confirmation
            </button>
            <button
              type="button"
              onClick={() => {
                void markAppointmentUsedAction(appt.id, "print");
                window.print();
              }}
              className={btnSecondary}
            >
              Print
            </button>
          </>
        ) : (
          <p className={mutedCls}>This draft was discarded.</p>
        )}
      </div>
      {appt.status === "approved" && mailto.length > MAILTO_MAX && <p className={mutedCls}>The confirmation is too long to open in an email link; copy it instead.</p>}
      {appt.status === "approved" && emailTo.length === 0 && <p className={mutedCls}>There&apos;s no email address on file, so add the recipient yourself.</p>}

      <p role="status" className="font-body text-body-sm font-medium text-ink print:hidden">
        {status}
      </p>
      {error && (
        <p role="alert" className={`${errorCls} print:hidden`}>
          {error}
        </p>
      )}
    </div>
  );
}
