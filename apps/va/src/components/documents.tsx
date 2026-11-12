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
  deleteDealDocumentAction,
  deleteUnfiledAction,
  fileDealDocumentAction,
  markNotNeededAction,
  setDocTypesAction,
  setMemberDocTypesAction,
  setSharedAction,
  type DocActionResult,
} from "@/lib/document-actions";
import { checkDealFile, safeFileName, staffDocPath } from "@/lib/documents";

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
      const r = await fileDealDocumentAction(dealId, path, type ? [type] : []);
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

const SIGNED: Record<CheckResult["signed"], string> = {
  yes: "Signed where it should be",
  no: "Not signed where it should be",
  unclear: "Signatures unclear",
  not_applicable: "No signatures expected",
};

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
}

/** One file: its types, and what can be done with it. */
export function DocItem({ dealId, source, id, name, href, meta, types, shared, canCheck }: DocItemProps) {
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
          <button type="button" className={linkAction} disabled={pending} onClick={() => run(() => setSharedAction(dealId, id, !shared))}>
            {shared ? "Stop sharing" : "Share with seller"}
            <span className="sr-only">: {name}</span>
          </button>
        )}
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
          <p className="mt-2 font-body text-body-sm text-ink">Written by the assistant: it can be wrong, so check the document. Nothing from this check is saved.</p>
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
