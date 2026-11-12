"use client";

import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { computeCoe, createBrowserSupabase } from "@vabrato/lib";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls, mutedCls } from "@/components/ui";
import { createDealAction, type FormState } from "@/lib/actions";
import { checkContract } from "@/lib/assistant";
import { readContractAction } from "@/lib/assistant-actions";
import { fmtLong } from "@/lib/dates";
import { CONTINGENCY_FIELDS, type IntakeField, type IntakeProposal } from "@/lib/intake-fields";

type FieldName = IntakeField | "escrow_number";

const START: Record<FieldName, string> = {
  address: "",
  escrow_number: "",
  seller_name: "",
  seller_type: "normal",
  ratification_date: "",
  days_to_close: "15",
  rent_back_days: "0",
  sale_price: "",
  cont_insurance: String(CONTINGENCY_FIELDS[0].usual),
  cont_financing: String(CONTINGENCY_FIELDS[1].usual),
  cont_appraisal: String(CONTINGENCY_FIELDS[2].usual),
  cont_property_condition: String(CONTINGENCY_FIELDS[3].usual),
};

/**
 * The intake form. With `reader` (the assistant and its contract reader are
 * both on), staff can upload the ratified contract and have the fields filled
 * in for checking. Nothing the assistant returns is saved: only what the
 * person submits here.
 */
export function IntakeForm({ reader }: { reader: { profileId: string } | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createDealAction, { error: null });
  const [values, setValues] = useState(START);
  const [draft, setDraft] = useState<IntakeProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const set = (name: FieldName) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));
  /** Props for a field's control, tied to the note saying where its value came from. */
  const field = (name: FieldName) => ({
    name,
    value: values[name],
    onChange: set(name),
    className: inputCls,
    ...(name !== "escrow_number" && draft?.sources[name] ? { "aria-describedby": `${uid}-${name}-src` } : {}),
  });
  /** A labelled control; the note on where its value came from sits outside the label, so it isn't part of the field's name. */
  const row = (name: FieldName, label: string, control: ReactNode) => {
    const s = name === "escrow_number" ? undefined : draft?.sources[name];
    return (
      <div key={name}>
        <label className={labelCls}>
          {label}
          <span className="mt-1 block">{control}</span>
        </label>
        {s && (
          <p id={`${uid}-${name}-src`} className={`${mutedCls} mt-1`}>
            From the contract{s.page ? `, page ${s.page}` : ""}
            {s.quote ? `: “${s.quote}”` : ""}
          </p>
        )}
      </div>
    );
  };

  async function readContract() {
    if (!reader || busy) return;
    setReadError(null);
    setStatus("");
    const file = fileRef.current?.files?.[0];
    if (!file) return setReadError("Choose the contract PDF first.");
    const problem = checkContract(file.size, new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (problem) return setReadError(problem);

    setBusy(true);
    const supabase = createBrowserSupabase();
    const path = `intake/${reader.profileId}/${crypto.randomUUID()}.pdf`;
    try {
      setStatus("Uploading the contract…");
      const { error: upErr } = await supabase.storage.from("deal-docs").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        setStatus("");
        return setReadError("Couldn't upload the contract. Try again.");
      }
      setStatus("Reading the contract. This can take a minute or two; you can keep filling in the form.");
      const result = await readContractAction(path);
      if (!result.ok) {
        setStatus("");
        return setReadError(result.error);
      }
      const filled = Object.keys(result.proposal.values).length;
      setValues((v) => ({ ...v, ...result.proposal.values }));
      setDraft(result.proposal);
      setStatus(`Filled in ${filled} ${filled === 1 ? "field" : "fields"} from the contract. Check each one before you create the transaction.`);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      // The action deletes the upload itself; this covers a dropped connection.
      await supabase.storage.from("deal-docs").remove([path]).catch(() => undefined);
      setStatus("");
      setReadError("Something went wrong reading the contract. Fill in the form by hand, or try again.");
    } finally {
      setBusy(false);
    }
  }

  let coePreview: string | null = null;
  try {
    const days = Number(values.days_to_close);
    if (values.ratification_date && Number.isInteger(days) && days >= 1) coePreview = computeCoe(values.ratification_date, days);
  } catch {
    coePreview = null;
  }

  return (
    <div className="space-y-5">
      <p className={mutedCls}>
        Enter the ratification date and the console builds the full task list, dated and owner-assigned, with weekends and holidays rolled forward. Trust and probate sales add estate tasks.
      </p>

      {reader && (
        <section aria-labelledby={`${uid}-reader`} className="space-y-3 border border-line bg-navy-50 p-4">
          <h3 id={`${uid}-reader`} className="font-body text-body-md font-medium text-ink">
            Fill in from the contract
          </h3>
          <p className="font-body text-body-sm text-ink">
            Upload the ratified contract and the assistant fills in the form below, with the page and a quote for each value. It can be wrong: check every value against the contract. The file is read once and not kept.
          </p>
          <label className={labelCls}>
            Contract (PDF, up to 20 MB)
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" disabled={busy} className={`${inputCls} mt-1 bg-white`} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={readContract} disabled={busy} className={btnSecondary}>
              {busy ? "Reading…" : "Read contract"}
            </button>
            <p role="status" className="font-body text-body-sm font-medium text-ink">
              {status}
            </p>
          </div>
          {readError && (
            <p role="alert" className={errorCls}>
              {readError}
            </p>
          )}
        </section>
      )}

      {draft && (
        <section aria-labelledby={`${uid}-draft`} className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink">
          <h3 id={`${uid}-draft`} className="font-medium">
            AI draft: check before you create the transaction
          </h3>
          <p className="mt-1">The values below were read from the contract by the assistant. The deadlines are set from what you confirm here, so compare each value with the page shown under it.</p>
          {draft.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {draft.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        {row("address", "Property address (required)", <input {...field("address")} required />)}
        {row("escrow_number", "Escrow number", <input {...field("escrow_number")} />)}
        {row("seller_name", "Seller name", <input {...field("seller_name")} />)}
        {row(
          "seller_type",
          "Seller type",
          <select {...field("seller_type")}>
            <option value="normal">Normal</option>
            <option value="trust">Trust</option>
            <option value="successor_trustee">Successor trustee</option>
            <option value="probate">Probate</option>
          </select>,
        )}
        {row("ratification_date", "Ratification date (required)", <input type="date" {...field("ratification_date")} required />)}
        {row("days_to_close", "Days to close escrow (required)", <input type="number" {...field("days_to_close")} required min={1} max={120} />)}
        {row("rent_back_days", "Rent-back days", <input type="number" {...field("rent_back_days")} min={0} max={90} />)}
        {row("sale_price", "Sale price ($)", <input type="number" {...field("sale_price")} min={0} step="1000" />)}

        <fieldset className="sm:col-span-2">
          <legend className="font-body text-body-sm font-medium text-ink">Contingency removals: days after ratification</legend>
          <p className={`${mutedCls} mt-1`}>The usual days are filled in. Leave a field blank if the contract has no such contingency.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">{CONTINGENCY_FIELDS.map((c) => row(c.field, c.label, <input type="number" {...field(c.field)} min={0} max={60} />))}</div>
        </fieldset>

        <p aria-live="polite" className="border border-dashed border-navy bg-navy-50 px-4 py-3 font-body text-body-sm text-ink sm:col-span-2">
          Computed close of escrow: <strong>{coePreview ? fmtLong(coePreview) : "enter a ratification date"}</strong>
        </p>

        {values.seller_type !== "normal" && (
          <p className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink sm:col-span-2">
            Estate or trust bank account, Letters Testamentary or trust certificate, and supplemental-tax tasks will be added.
          </p>
        )}

        {state.error && (
          <p role="alert" className={`${errorCls} sm:col-span-2`}>
            {state.error}
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Generating…" : "Create transaction and task list"}
          </button>
        </div>
      </form>
    </div>
  );
}
