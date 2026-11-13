"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_KEYS, createBrowserSupabase, type DocType } from "@vabrato/lib";
import { Pill } from "@vabrato/ui/web";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, linkAction, linkDanger, mutedCls, okCls } from "@/components/ui";
import type { CheckResult } from "@/lib/document-check";
import {
  checkDocumentAction,
  clearMarkAction,
  counterChangesAction,
  deleteDealDocumentAction,
  deleteUnfiledAction,
  fileDealDocumentAction,
  markNotNeededAction,
  setDocTypesAction,
  setMemberDocTypesAction,
  setSharedAction,
  type DocActionResult,
} from "@/lib/document-actions";
import { SIGNED_LABEL, checkDealFile, safeFileName, staffDocPath, type UncheckedFile } from "@/lib/documents";
import type { CounterResult } from "@/lib/counter-changes";

// The Documents tab's controls (S6b PR 7a). Files go from the browser straight
// to the deal's staff folder in storage; the server actions record and move
// them. The assistant's check only suggests types: the person saves them.

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

const show = (r: DocActionResult): Status => (r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });

export function DocumentUploader({ dealId }: { dealId: string }) {
  const uid = useId();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStatus(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setStatus({ kind: "error", text: "Choose a file first." });
    const checked = checkDealFile(file.size, new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if ("error" in checked) return setStatus({ kind: "error", text: checked.error });
    setBusy(true);
    const supabase = createBrowserSupabase();
    const path = staffDocPath(dealId, crypto.randomUUID(), safeFileName(file.name, checked.type));
    try {
      setStatus({ kind: "ok", text: "Uploading…" });
      const { error } = await supabase.storage.from("deal-docs").upload(path, file, { contentType: checked.type, upsert: false });
      if (error) return setStatus({ kind: "error", text: "Couldn't upload the file. Try again." });
      const r = await fileDealDocumentAction(dealId, path, type ? [type] : [], file.name);
      if (!r.ok) await supabase.storage.from("deal-docs").remove([path]).catch(() => undefined);
      setStatus(show(r.ok ? { ok: true, message: `${r.message} It's staff-only until you share it.` } : r));
      if (r.ok) {
        if (fileRef.current) fileRef.current.value = "";
        setType("");
        router.refresh();
      }
    } catch {
      setStatus({ kind: "error", text: "Something went wrong uploading. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${uid}-file`} className={labelCls}>
          File (PDF, JPG or PNG, up to 20 MB)
        </label>
        <input id={`${uid}-file`} ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={`${uid}-type`} className={labelCls}>
          What is it? (optional)
        </label>
        <select id={`${uid}-type`} value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} mt-1`}>
          <option value="">Choose later</option>
          {DOC_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {DOC_TYPES[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      <div className="sm:col-span-2">
        <StatusLine status={status} />
      </div>
    </form>
  );
}

function TypesEditor({ initial, onSave, onCancel, saveLabel }: { initial: DocType[]; onSave: (types: DocType[]) => void; onCancel: () => void; saveLabel: string }) {
  const uid = useId();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  return (
    <fieldset className="mt-3 border border-line p-3">
      <legend className="px-1 font-body text-body-sm font-medium text-ink">What this file contains</legend>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {DOC_TYPE_KEYS.map((k) => (
          <div key={k} className="flex min-h-[44px] items-center gap-2">
            <input
              id={`${uid}-${k}`}
              type="checkbox"
              checked={picked.has(k)}
              onChange={(e) => setPicked((p) => (e.target.checked ? new Set(p).add(k) : new Set([...p].filter((x) => x !== k))))}
              className="h-5 w-5"
            />
            <label htmlFor={`${uid}-${k}`} className="font-body text-body-sm text-ink">
              {DOC_TYPES[k]}
            </label>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={btnPrimary} onClick={() => onSave(DOC_TYPE_KEYS.filter((k) => picked.has(k)))}>
          {saveLabel}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}

/** The question asked before a file goes to the seller's Documents page. */
export const shareQuestion = (name: string) => `Share ${name} with the seller? They'll see it on their Documents page. Never share wiring or bank instructions here.`;

const SIGNED = SIGNED_LABEL;

export interface DocItemProps {
  dealId: string;
  source: "deal" | "member" | "unfiled";
  /** deal_documents.id, member_documents.id, or (unfiled) the storage path. */
  id: string;
  name: string;
  href: string;
  meta: string;
  types: DocType[];
  shared?: boolean;
  canCheck: boolean;
  /** More actions for this file (S6b PR 7b: "Repair items" on inspection reports; 7c: "What changed" on counter offers). */
  extra?: React.ReactNode;
  /** When the assistant last checked it (S6b PR 7c), e.g. "Checked Wed, Nov 12 by …". */
  checked?: string;
}

/** One file: its types, and what can be done with it. */
export function DocItem({ dealId, source, id, name, href, meta, types, shared, canCheck, extra, checked }: DocItemProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<DocType[] | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DocActionResult>, after?: () => void) =>
    start(async () => {
      setStatus(null);
      const r = await fn();
      setStatus(show(r));
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  const save = (t: DocType[]) =>
    run(
      () => (source === "deal" ? setDocTypesAction(dealId, id, t) : source === "member" ? setMemberDocTypesAction(dealId, id, t) : fileDealDocumentAction(dealId, id, t)),
      () => {
        setEditing(null);
        setCheck(null);
      },
    );

  const runCheck = () =>
    start(async () => {
      setStatus({ kind: "ok", text: "Checking the document. This can take a minute." });
      setCheck(null);
      const r = await checkDocumentAction(dealId, source === "member" ? "member" : "deal", id);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      router.refresh();
      setCheck(r.result);
      setEditing(r.result.docTypes.length ? r.result.docTypes : types);
      setStatus({ kind: "ok", text: r.result.docTypes.length ? "Checked. The suggested types are ticked below: save them if they're right." : "Checked. It doesn't look like any checklist document; tick types by hand if it is one." });
    });

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={href} className="break-all font-body text-body-sm font-medium text-navy underline">
            {name}
          </a>
          <p className={mutedCls}>{meta}</p>
          {checked && <p className={mutedCls}>{checked}</p>}
          <p className="mt-1 font-body text-body-sm text-ink">{types.length ? types.map((t) => DOC_TYPES[t]).join(" · ") : source === "unfiled" ? "Not filed yet" : "No type yet"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {source === "deal" && <Pill tone={shared ? "green" : "neutral"}>{shared ? "Shared with seller" : "Staff only"}</Pill>}
          {source === "member" && <Pill tone="neutral">Seller&apos;s upload</Pill>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" className={linkAction} disabled={pending} onClick={() => setEditing(editing ? null : types)} aria-expanded={editing !== null}>
          {source === "unfiled" ? "File it" : "Edit types"}
          <span className="sr-only"> for {name}</span>
        </button>
        {canCheck && source !== "unfiled" && (
          <button type="button" className={linkAction} disabled={pending} onClick={runCheck}>
            Check this document<span className="sr-only">: {name}</span>
          </button>
        )}
        {source === "deal" && (
          <button
            type="button"
            className={linkAction}
            disabled={pending}
            onClick={() => {
              if (shared || window.confirm(shareQuestion(name))) run(() => setSharedAction(dealId, id, !shared));
            }}
          >
            {shared ? "Stop sharing" : "Share with seller"}
            <span className="sr-only">: {name}</span>
          </button>
        )}
        {extra}
        {source !== "member" && (
          <button
            type="button"
            className={linkDanger}
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Delete ${name}? This can't be undone.`)) run(() => (source === "deal" ? deleteDealDocumentAction(dealId, id) : deleteUnfiledAction(dealId, id)));
            }}
          >
            Delete<span className="sr-only"> {name}</span>
          </button>
        )}
      </div>
      <StatusLine status={status} />
      {check && (
        <section aria-label={`What the assistant found in ${name}`} className="mt-3 border border-line bg-navy-50 p-3">
          <p className="font-body text-body-sm text-ink">
            <span className="font-medium">{check.title || "Document"}</span> · {SIGNED[check.signed]}
          </p>
          {check.issues.length ? (
            <ul className="mt-2 list-disc pl-5 font-body text-body-sm text-ink">
              {check.issues.map((i, n) => (
                <li key={n}>
                  {i.page ? `Page ${i.page}: ` : ""}
                  {i.issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 font-body text-body-sm text-ink">Nothing to look at found.</p>
          )}
          <p className="mt-2 font-body text-body-sm text-ink">Written by the assistant: it can be wrong, so check the document. The console keeps only that it was checked, the signed answer and the count; what the assistant wrote isn&apos;t saved.</p>
        </section>
      )}
      {editing && <TypesEditor key={editing.join(",")} initial={editing} saveLabel={source === "unfiled" ? "File it" : "Save types"} onSave={save} onCancel={() => setEditing(null)} />}
    </li>
  );
}

/** "Mark not needed" (with a short note) or "Undo" for one checklist item. */
export function ChecklistMarkControl({ dealId, itemKey, label, marked }: { dealId: string; itemKey: string; label: string; marked: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DocActionResult>) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? null : show(r));
      if (r.ok) {
        setOpen(false);
        setNote("");
        router.refresh();
      }
    });

  if (marked)
    return (
      <div>
        <button type="button" className={linkAction} disabled={pending} onClick={() => run(() => clearMarkAction(dealId, itemKey))}>
          Undo<span className="sr-only">: {label} is needed after all</span>
        </button>
        <StatusLine status={status} />
      </div>
    );
  return (
    <div>
      <button type="button" className={linkAction} aria-expanded={open} onClick={() => setOpen(!open)}>
        Mark not needed<span className="sr-only">: {label}</span>
      </button>
      {open && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => markNotNeededAction(dealId, itemKey, note));
          }}
        >
          <div>
            <label htmlFor={`${uid}-note`} className={labelCls}>
              Why (optional)
            </label>
            <input id={`${uid}-note`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <button type="submit" disabled={pending} className={btnSecondary}>
            Save<span className="sr-only">: {label} not needed</span>
          </button>
        </form>
      )}
      <StatusLine status={status} />
    </div>
  );
}

// --- What changed in a counter offer (S6b PR 7c) ------------------------------------------------------

const ROW_PILL = { differs: { tone: "red", text: "Differs" }, same: { tone: "green", text: "Same" }, not_addressed: { tone: "neutral", text: "Not in this document" } } as const;
const KIND_LABEL: Record<CounterResult["kind"], string> = { counter_offer: "Counter offer", addendum: "Addendum", other: "Not a counter offer or addendum" };

/** "What changed" next to a counter offer or addendum: shown only, nothing saved. */
export function CounterChanges({ dealId, source, id, name }: { dealId: string; source: "deal" | "member"; id: string; name: string }) {
  const [result, setResult] = useState<CounterResult | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const read = () =>
    start(async () => {
      setResult(null);
      setStatus({ kind: "ok", text: "Reading the document. This can take a minute." });
      const r = await counterChangesAction(dealId, source, id);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setResult(r.result);
      setStatus({ kind: "ok", text: r.result.differs ? `Read. ${r.result.differs} ${r.result.differs === 1 ? "term differs" : "terms differ"} from our records.` : "Read. No term differs from our records." });
    });

  return (
    <>
      <button type="button" className={linkAction} disabled={pending} onClick={read}>
        What changed<span className="sr-only">: {name}</span>
      </button>
      {(status || result) && (
        <div className="w-full">
          <StatusLine status={status} />
          {result && (
            <section aria-label={`What ${name} changes`} className="mt-3 border border-line bg-navy-50 p-3">
              <p className="font-body text-body-sm font-medium text-ink">
                {KIND_LABEL[result.kind]} · compared with this transaction&apos;s recorded terms
              </p>
              <p className="mt-1 font-body text-body-sm text-ink">Shown only. The deal&apos;s terms and schedule are not changed.</p>
              {result.signedByBoth !== "yes" && (
                <p role="note" className="mt-1 font-body text-body-sm font-medium text-red">
                  This may not be signed by both sides; it may not be in effect.
                </p>
              )}
              <ul className="mt-3 divide-y divide-line" aria-label="Terms">
                {result.rows.map((r) => (
                  <li key={r.key} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-body text-body-sm font-medium text-ink">{r.label}</p>
                      <Pill tone={ROW_PILL[r.status].tone}>{ROW_PILL[r.status].text}</Pill>
                    </div>
                    <dl className="mt-1 grid gap-x-4 font-body text-body-sm text-ink sm:grid-cols-2">
                      <div>
                        <dt className="inline font-medium">Our records: </dt>
                        <dd className="inline">{r.ours}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">This document: </dt>
                        <dd className="inline">
                          {r.theirs ?? "Doesn't say"}
                          {r.page ? ` (page ${r.page})` : ""}
                        </dd>
                      </div>
                    </dl>
                    {r.quote && <p className="mt-1 break-words font-body text-body-sm italic text-ink">&ldquo;{r.quote}&rdquo;</p>}
                  </li>
                ))}
              </ul>
              {result.otherChanges.length > 0 && (
                <>
                  <h3 className="mt-3 font-body text-body-sm font-medium text-ink">Other changes</h3>
                  <ul className="mt-1 list-disc pl-5 font-body text-body-sm text-ink">
                    {result.otherChanges.map((o, n) => (
                      <li key={n}>
                        {o.page ? `Page ${o.page}: ` : ""}
                        {o.change}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-2 font-body text-body-sm text-ink">Read by the assistant: it can be wrong, so check the document. To change the deal&apos;s terms, a person edits the transaction.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

// --- Check unchecked documents (S6b PR 7c) ----------------------------------------------------------

type BatchRow = { file: UncheckedFile; result: CheckResult | null; error: string | null; saved: boolean };

/**
 * Checks up to 10 never-checked files, one assistant request each, after the
 * person confirms. The browser sends them one at a time so each gets its own
 * time limit; the server checks each file again. A limit or budget answer
 * stops the run; Stop finishes the current file.
 */
export function CheckUnchecked({ dealId, total, next }: { dealId: string; total: number; next: UncheckedFile[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [at, setAt] = useState(0);
  const [batch, setBatch] = useState<UncheckedFile[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const stopRef = useRef(false);
  const n = next.length;

  async function run() {
    const batch = next.slice();
    setConfirming(false);
    setRunning(true);
    setRows([]);
    setBatch(batch);
    setStatus(null);
    stopRef.current = false;
    let ok = 0;
    let stoppedBy: string | null = null;
    for (let i = 0; i < batch.length; i++) {
      if (stopRef.current) break;
      const file = batch[i]!;
      setAt(i + 1);
      try {
        const r = await checkDocumentAction(dealId, file.source, file.id);
        if (r.ok) ok++;
        setRows((prev) => [...prev, { file, result: r.ok ? r.result : null, error: r.ok ? null : r.error, saved: false }]);
        if (!r.ok && r.stop) {
          stoppedBy = r.error;
          break;
        }
      } catch {
        setRows((prev) => [...prev, { file, result: null, error: "Something went wrong checking this file.", saved: false }]);
      }
    }
    setRunning(false);
    setAt(0);
    router.refresh();
    setStatus(
      stoppedBy
        ? { kind: "error", text: `Stopped after ${ok} checked. ${stoppedBy}` }
        : { kind: "ok", text: `${stopRef.current ? "Stopped. " : ""}Checked ${ok} of ${batch.length}.${ok < batch.length && !stopRef.current ? " The others are listed with what went wrong." : ""} Review each below and save the types that are right.` },
    );
  }

  const saveTypes = async (row: BatchRow, idx: number) => {
    if (!row.result) return;
    const r = row.file.source === "deal" ? await setDocTypesAction(dealId, row.file.id, row.result.docTypes) : await setMemberDocTypesAction(dealId, row.file.id, row.result.docTypes);
    if (r.ok) setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, saved: true } : x)));
    else setStatus({ kind: "error", text: r.error });
    router.refresh();
  };

  return (
    <div className="mb-4">
      {total > 0 ? (
        <p className={mutedCls}>
          {total} {total === 1 ? "document hasn't" : "documents haven't"} been checked by the assistant.
        </p>
      ) : (
        !rows.length && <p className={mutedCls}>Every document has been checked by the assistant.</p>
      )}
      {n > 0 && !running && !confirming && (
        <button type="button" className={`${btnSecondary} mt-2`} onClick={() => setConfirming(true)}>
          Check unchecked documents ({total})
        </button>
      )}
      {confirming && (
        <div role="group" aria-labelledby="check-unchecked-q" className="mt-2 border border-line bg-navy-50 p-3">
          <p id="check-unchecked-q" className="font-body text-body-sm text-ink">
            Check {n === total ? `${n} unchecked ${n === 1 ? "document" : "documents"}` : `${n} of ${total} unchecked documents`}? Each file is one assistant request: {n} {n === 1 ? "request" : "requests"}, counted against your daily limit. Oldest first.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} onClick={run}>
              Check {n} {n === 1 ? "document" : "documents"}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div aria-live="polite">
        {running && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p role="status" className="font-body text-body-sm font-medium text-ink">
              Checking {at} of {batch.length}: {batch[at - 1]?.name ?? ""}
            </p>
            <button type="button" className={btnSecondary} onClick={() => (stopRef.current = true)}>
              Stop after this one
            </button>
          </div>
        )}
      </div>
      <StatusLine status={status} />
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-line border border-line" aria-label="Check results">
          {rows.map((row, i) => (
            <li key={`${row.file.source}-${row.file.id}`} className="p-3">
              <p className="break-all font-body text-body-sm font-medium text-ink">{row.file.name}</p>
              {row.error ? (
                <p className={errorCls}>{row.error}</p>
              ) : row.result ? (
                <>
                  <p className="font-body text-body-sm text-ink">
                    {row.result.title || "Document"} · {SIGNED[row.result.signed]}
                  </p>
                  {row.result.issues.length ? (
                    <ul className="mt-1 list-disc pl-5 font-body text-body-sm text-ink">
                      {row.result.issues.map((x, k) => (
                        <li key={k}>
                          {x.page ? `Page ${x.page}: ` : ""}
                          {x.issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-body text-body-sm text-ink">Nothing to look at found.</p>
                  )}
                  <p className="mt-1 font-body text-body-sm text-ink">Suggested types: {row.result.docTypes.length ? row.result.docTypes.map((t) => DOC_TYPES[t]).join(" · ") : "none"}</p>
                  {row.result.docTypes.length > 0 &&
                    (row.saved ? (
                      <p className={okCls}>Types saved.</p>
                    ) : (
                      <button type="button" className={linkAction} onClick={() => saveTypes(row, i)}>
                        Save these types<span className="sr-only"> for {row.file.name}</span>
                      </button>
                    ))}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <p className={`${mutedCls} mt-2`}>Written by the assistant: it can be wrong, so check each document. Only that it was checked, the signed answer and the count are kept; these notes go when you leave the page.</p>}
    </div>
  );
}
