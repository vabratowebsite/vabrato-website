"use client";

import { useActionState, useState, type ReactNode } from "react";
import { computeCoe } from "@vabrato/lib";
import { btnPrimary, errorCls, inputCls, labelCls, mutedCls } from "@/components/ui";
import { createDealAction, type FormState } from "@/lib/actions";
import { fmtLong } from "@/lib/dates";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={labelCls}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function IntakeForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createDealAction, { error: null });
  const [ratification, setRatification] = useState("");
  const [daysToClose, setDaysToClose] = useState("15");
  const [sellerType, setSellerType] = useState("normal");

  let coePreview: string | null = null;
  try {
    const days = Number(daysToClose);
    if (ratification && Number.isInteger(days) && days >= 1) coePreview = computeCoe(ratification, days);
  } catch {
    coePreview = null;
  }

  return (
    <div className="space-y-5">
      <p className={mutedCls}>
        Enter the ratification date and the console builds the full task list, dated and owner-assigned, with weekends and holidays rolled forward. Trust and probate sales add estate tasks.
      </p>
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <Field label="Property address (required)">
          <input name="address" required className={inputCls} />
        </Field>
        <Field label="Escrow number">
          <input name="escrow_number" className={inputCls} />
        </Field>
        <Field label="Seller name">
          <input name="seller_name" className={inputCls} />
        </Field>
        <Field label="Seller type">
          <select name="seller_type" value={sellerType} onChange={(e) => setSellerType(e.target.value)} className={inputCls}>
            <option value="normal">Normal</option>
            <option value="trust">Trust</option>
            <option value="successor_trustee">Successor trustee</option>
            <option value="probate">Probate</option>
          </select>
        </Field>
        <Field label="Ratification date (required)">
          <input type="date" name="ratification_date" required value={ratification} onChange={(e) => setRatification(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Days to close escrow (required)">
          <input type="number" name="days_to_close" required min={1} max={120} value={daysToClose} onChange={(e) => setDaysToClose(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Rent-back days">
          <input type="number" name="rent_back_days" min={0} max={90} defaultValue={0} className={inputCls} />
        </Field>
        <Field label="Sale price ($)">
          <input type="number" name="sale_price" min={0} step="1000" className={inputCls} />
        </Field>

        <p aria-live="polite" className="border border-dashed border-navy bg-navy-50 px-4 py-3 font-body text-body-sm text-ink sm:col-span-2">
          Computed close of escrow: <strong>{coePreview ? fmtLong(coePreview) : "enter a ratification date"}</strong>
        </p>

        {sellerType !== "normal" && (
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
