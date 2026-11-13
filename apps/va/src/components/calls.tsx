"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CALL_LIMITS, APPT_LIMITS, CALL_NOTE_LINES, APPT_LINES } from "@/lib/appointment-kinds";
import { addTodosAction, deleteTodoAction, readCallNotesAction, setTodoDoneAction, startAppointmentAction, type Target } from "@/lib/call-actions";
import type { DraftView } from "@/lib/draft-actions";
import type { SuggestedTodo } from "@/lib/calls";
import { DraftPanel } from "./draft-panel";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, linkAction, linkDanger, mutedCls, okCls } from "./ui";

// Call notes, appointment drafts and staff to-dos (S6b PR 8). The assistant
// suggests; the person ticks the to-dos to add, approves the follow-up and
// the appointment, and sends or adds them to a calendar themselves.

type Status = { kind: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  return (
    <div aria-live="polite">
      {status?.kind === "ok" && (
        <p role="status" className={okCls}>
          {status.text}
        </p>
      )}
      {status?.kind === "error" && (
        <p role="alert" className={errorCls}>
          {status.text}
        </p>
      )}
    </div>
  );
}

// --- Call notes ------------------------------------------------------------------------------------

export function CallNotesPanel({ target, initialFollowup, emailTo, portal }: { target: Target; initialFollowup: DraftView | null; emailTo: string[]; portal: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saveOnLead, setSaveOnLead] = useState(false);
  const [todos, setTodos] = useState<(SuggestedTodo & { on: boolean })[]>([]);
  const [followup, setFollowup] = useState<DraftView | null>(initialFollowup);
  const [status, setStatus] = useState<Status>(null);
  const [todoStatus, setTodoStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const isLead = target.kind === "lead";

  const read = () =>
    start(async () => {
      setStatus({ kind: "ok", text: "Reading your notes. This takes a few seconds." });
      setTodoStatus(null);
      const r = await readCallNotesAction(target, notes, isLead && saveOnLead);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setTodos(r.todos.map((t) => ({ ...t, on: true })));
      if (r.followup) setFollowup(r.followup);
      setNotes("");
      setSaveOnLead(false);
      setStatus({ kind: "ok", text: r.message });
      router.refresh();
    });

  const add = () =>
    start(async () => {
      const ticked = todos.filter((t) => t.on).map(({ title, due }) => ({ title, due }));
      const r = await addTodosAction(target, ticked, "call_notes");
      setTodoStatus(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
      if (r.ok) {
        setTodos([]);
        router.refresh();
      }
    });

  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-4">
      <h3 id={`${uid}-h`} className="font-body text-body-md font-medium text-ink">
        Call notes
      </h3>
      <div>
        <label htmlFor={`${uid}-notes`} className={labelCls}>
          Your notes from the call
        </label>
        <p id={`${uid}-hint`} className={`${mutedCls} mt-1`}>
          The assistant suggests to-dos and, if the call needs one, a follow-up email. {isLead ? CALL_NOTE_LINES.notKeptLead : CALL_NOTE_LINES.notKeptDeal} Leave out lockbox codes and access details.
        </p>
        <textarea id={`${uid}-notes`} aria-describedby={`${uid}-hint`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={CALL_LIMITS.notes} rows={5} disabled={pending} className={`${inputCls} mt-1`} />
      </div>
      {isLead && (
        <div className="flex min-h-[44px] items-center gap-2">
          <input id={`${uid}-keep`} type="checkbox" checked={saveOnLead} onChange={(e) => setSaveOnLead(e.target.checked)} className="h-5 w-5" />
          <label htmlFor={`${uid}-keep`} className="font-body text-body-sm text-ink">
            Save these notes on the lead
          </label>
        </div>
      )}
      <button type="button" onClick={read} disabled={pending || !notes.trim()} className={btnSecondary}>
        {pending && !todos.length ? "Reading…" : "Suggest to-dos and a follow-up"}
      </button>
      <StatusLine status={status} />

      {todos.length > 0 && (
        <fieldset className="border border-line p-3">
          <legend className="px-1 font-body text-body-sm font-medium text-ink">Suggested to-dos</legend>
          <p className={`${mutedCls} mb-2`}>{CALL_NOTE_LINES.suggested}</p>
          <ul className="space-y-3">
            {todos.map((t, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[auto_1fr_11rem] sm:items-end">
                <div className="flex min-h-[44px] items-center">
                  <input
                    id={`${uid}-t${i}`}
                    type="checkbox"
                    checked={t.on}
                    onChange={(e) => setTodos((list) => list.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))}
                    className="h-5 w-5"
                    aria-label={`Add: ${t.title}`}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-tt${i}`} className={labelCls}>
                    To-do {i + 1}
                  </label>
                  <input id={`${uid}-tt${i}`} value={t.title} maxLength={200} onChange={(e) => setTodos((list) => list.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} className={`${inputCls} mt-1`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-td${i}`} className={labelCls}>
                    Due (optional)
                  </label>
                  <input id={`${uid}-td${i}`} type="date" value={t.due} onChange={(e) => setTodos((list) => list.map((x, k) => (k === i ? { ...x, due: e.target.value } : x)))} className={`${inputCls} mt-1`} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={add} disabled={pending || !todos.some((t) => t.on)} className={btnPrimary}>
              Add ticked to-dos
            </button>
            <button type="button" onClick={() => setTodos([])} disabled={pending} className={btnSecondary}>
              Dismiss
            </button>
          </div>
        </fieldset>
      )}
      <StatusLine status={todoStatus} />

      {followup && (
        <DraftPanel
          key={followup.id}
          heading="Follow-up after the call"
          target={isLead ? { target: "lead", leadId: target.id } : { target: "escrow", dealId: target.id }}
          initial={followup}
          emailTo={emailTo}
          portal={portal}
          noteLabel=""
          noteHint=""
          editOnly
        />
      )}
    </section>
  );
}

// --- Appointments -------------------------------------------------------------------------------------

export interface AppointmentRow {
  id: string;
  title: string;
  when: string;
  status: "draft" | "approved";
  mine: boolean;
}

export function AppointmentStarter({ target, appointments }: { target: Target; appointments: AppointmentRow[] }) {
  const uid = useId();
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();

  const draft = () =>
    start(async () => {
      setStatus({ kind: "ok", text: "Drafting the appointment. This takes a few seconds." });
      const r = await startAppointmentAction(target, sentence);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      router.push(`/appointments/${r.id}`);
    });

  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-3">
      <h3 id={`${uid}-h`} className="font-body text-body-md font-medium text-ink">
        Draft an appointment
      </h3>
      <div>
        <label htmlFor={`${uid}-s`} className={labelCls}>
          Describe it in a sentence
        </label>
        <p id={`${uid}-hint`} className={`${mutedCls} mt-1`}>
          What, when, how long and where. For example: walkthrough with the seller Tuesday 3pm, 45 min, at the house. {APPT_LINES.noBooking}
        </p>
        <input id={`${uid}-s`} aria-describedby={`${uid}-hint`} value={sentence} onChange={(e) => setSentence(e.target.value)} maxLength={APPT_LIMITS.sentence} disabled={pending} className={`${inputCls} mt-1`} />
      </div>
      <button type="button" onClick={draft} disabled={pending || !sentence.trim()} className={btnSecondary}>
        {pending ? "Drafting…" : "Draft the appointment"}
      </button>
      <StatusLine status={status} />
      {appointments.length > 0 && (
        <ul aria-label="Appointments" className="divide-y divide-line border border-line">
          {appointments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 font-body text-body-sm text-ink">
              <span className="min-w-0">
                <span className="font-medium">{a.title}</span> · {a.when}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted">{a.status === "approved" ? "Approved" : "Draft"}</span>
                <Link href={`/appointments/${a.id}`} className={linkAction}>
                  Open<span className="sr-only"> {a.title}</span>
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- To-dos ---------------------------------------------------------------------------------------------

export interface TodoRow {
  id: string;
  title: string;
  due_date: string | null;
  dueText: string | null;
  overdue: boolean;
  source: string;
  /** On Today: the lead or deal it belongs to. */
  where?: { href: string; label: string };
}

export function TodoList({ target, todos, showAdd = true, empty }: { target?: Target; todos: TodoRow[]; showAdd?: boolean; empty: string }) {
  const uid = useId();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {todos.length ? (
        <ul aria-label="To-dos" className="divide-y divide-line">
          {todos.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="break-words font-body text-body-sm text-ink">{t.title}</p>
                <p className={t.overdue ? "font-body text-body-sm font-medium text-red" : mutedCls}>
                  {t.dueText ? `${t.overdue ? "Overdue: " : "Due "}${t.dueText}` : "No due date"}
                  {t.source === "call_notes" ? " · from call notes" : ""}
                  {t.where && (
                    <>
                      {" · "}
                      <Link href={t.where.href} className="text-navy underline">
                        {t.where.label}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className={linkAction} disabled={pending} onClick={() => run(() => setTodoDoneAction(t.id, true))}>
                  Done<span className="sr-only">: {t.title}</span>
                </button>
                <button type="button" className={linkDanger} disabled={pending} onClick={() => window.confirm(`Delete "${t.title}"?`) && run(() => deleteTodoAction(t.id))}>
                  Delete<span className="sr-only">: {t.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={mutedCls}>{empty}</p>
      )}
      {showAdd && target && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addTodosAction(target, [{ title, due }], "manual"), () => {
              setTitle("");
              setDue("");
            });
          }}
        >
          <div>
            <label htmlFor={`${uid}-title`} className={labelCls}>
              New to-do
            </label>
            <input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label htmlFor={`${uid}-due`} className={labelCls}>
              Due (optional)
            </label>
            <input id={`${uid}-due`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <button type="submit" disabled={pending || !title.trim()} className={btnSecondary}>
            Add to-do
          </button>
        </form>
      )}
      <StatusLine status={status} />
    </div>
  );
}
