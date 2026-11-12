"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createBrowserSupabase } from "@vabrato/lib";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { addReceiptAction, type FormState } from "@/lib/actions";
import { prepareReceiptUploadAction, readReceiptAction } from "@/lib/document-actions";
import { EXT, checkReceiptFile } from "@/lib/documents";

// Add a receipt (S6 PR 1), with an optional file (S6b PR 7a). With the
// receipt reader on, "Read it" fills the form from the file; the person
// checks it and saves. The file is uploaded to the person's own folder for
// this deal and kept with the receipt.

const EMPTY = { vendor: "", amount: "", category: "", receipt_date: "" };

export function ReceiptForm({ dealId, readerOn }: { dealId: string; readerOn: boolean }) {
  const uid = useId();
  const [state, formAction, pending] = useActionState<FormState, FormData>(addReceiptAction.bind(null, dealId), { error: null });
  const [values, setValues] = useState(EMPTY);
  const [path, setPath] = useState("");
  const [fileNote, setFileNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      setValues(EMPTY);
      setPath("");
      setFileNote({ kind: "ok", text: "Receipt added." });
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function attach(): Promise<string | null> {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    const checked = checkReceiptFile(file.size, new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if ("error" in checked) {
      setFileNote({ kind: "error", text: checked.error });
      return null;
    }
    const { folder } = await prepareReceiptUploadAction(dealId);
    const next = `${folder}/${crypto.randomUUID()}.${EXT[checked.type]}`;
    const { error } = await createBrowserSupabase().storage.from("receipts").upload(next, file, { contentType: checked.type, upsert: false });
    if (error) {
      setFileNote({ kind: "error", text: "Couldn't upload the receipt. Try again, or add it without the file." });
      return null;
    }
    setPath(next);
    return next;
  }

  async function onFile() {
    setPath("");
    setFileNote(null);
    if (!fileRef.current?.files?.[0]) return;
    setBusy(true);
    try {
      const p = await attach();
      if (p) setFileNote({ kind: "ok", text: readerOn ? "Attached. Use “Read it” to fill in the form, or fill it in yourself." : "Attached. It's saved with the receipt." });
    } finally {
      setBusy(false);
    }
  }

  async function read() {
    if (!path || busy) return;
    setBusy(true);
    setFileNote({ kind: "ok", text: "Reading the receipt…" });
    try {
      const r = await readReceiptAction(dealId, path);
      if (!r.ok) return setFileNote({ kind: "error", text: r.error });
      if (!r.proposal.ok) return setFileNote({ kind: "error", text: r.proposal.problem });
      const p = r.proposal;
      setValues({ vendor: p.vendor, amount: p.amount, category: p.category, receipt_date: p.date });
      setFileNote({ kind: "ok", text: "Filled in from the receipt. Check each value before you add it." });
    } catch {
      setFileNote({ kind: "error", text: "Something went wrong reading the receipt. Fill in the form by hand." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-file`} className={labelCls}>
          Receipt file (optional: PDF, JPG, PNG or WebP, up to 10 MB)
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input id={`${uid}-file`} ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onFile} disabled={busy} className={inputCls} />
          {readerOn && (
            <button type="button" className={btnSecondary} disabled={!path || busy} onClick={read}>
              Read it
            </button>
          )}
        </div>
        {readerOn && <p className={`${mutedCls} mt-1`}>The assistant reads the vendor, total, date and a category. It can be wrong: check them.</p>}
        <div aria-live="polite">
          {fileNote && (
            <p role={fileNote.kind === "error" ? "alert" : "status"} className={`${fileNote.kind === "error" ? errorCls : okCls} mt-1`}>
              {fileNote.text}
            </p>
          )}
        </div>
        <input type="hidden" name="storage_path" value={path} />
      </div>
      <div>
        <label htmlFor={`${uid}-vendor`} className={labelCls}>
          Vendor
        </label>
        <input id={`${uid}-vendor`} name="vendor" required value={values.vendor} onChange={set("vendor")} className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={`${uid}-amount`} className={labelCls}>
          Amount ($)
        </label>
        <input id={`${uid}-amount`} name="amount" required type="number" step="0.01" min="0.01" value={values.amount} onChange={set("amount")} className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={`${uid}-category`} className={labelCls}>
          Category (optional)
        </label>
        <input id={`${uid}-category`} name="category" value={values.category} onChange={set("category")} className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={`${uid}-date`} className={labelCls}>
          Receipt date (optional)
        </label>
        <input id={`${uid}-date`} name="receipt_date" type="date" value={values.receipt_date} onChange={set("receipt_date")} className={`${inputCls} mt-1`} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending || busy} className={btnPrimary}>
          {pending ? "Adding…" : "Add receipt"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className={`${errorCls} sm:col-span-2`}>
          {state.error}
        </p>
      )}
    </form>
  );
}
