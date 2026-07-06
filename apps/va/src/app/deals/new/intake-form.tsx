"use client";

import { useActionState, useState } from "react";
import { computeCoe } from "@vabrato/lib";
import { T } from "@vabrato/ui";
import { createDealAction, type FormState } from "@/lib/actions";
import { fmtLong } from "@/lib/dates";

const inputStyle = { border: `1px solid ${T.line}`, background: T.surface };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: T.muted }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function IntakeForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createDealAction, {
    error: null,
  });
  const [ratification, setRatification] = useState("");
  const [daysToClose, setDaysToClose] = useState("15");
  const [sellerType, setSellerType] = useState("normal");

  let coePreview: string | null = null;
  try {
    const days = Number(daysToClose);
    if (ratification && Number.isInteger(days) && days >= 1) {
      coePreview = computeCoe(ratification, days);
    }
  } catch {
    coePreview = null;
  }

  return (
    <section
      className="rounded-2xl p-6"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <h1 className="mb-1 font-serif text-lg">New transaction</h1>
      <p className="mb-5 text-sm" style={{ color: T.muted }}>
        Enter the ratification date and the desk builds the full task list, dated and
        owner-assigned — weekends and holidays rolled forward automatically. Trust/Probate adds
        estate tasks.
      </p>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <Field label="Property address *">
          <input name="address" required className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Escrow #">
          <input name="escrow_number" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Seller name">
          <input name="seller_name" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Seller type">
          <select
            name="seller_type"
            value={sellerType}
            onChange={(e) => setSellerType(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="normal">Normal</option>
            <option value="trust">Trust</option>
            <option value="successor_trustee">Successor Trustee</option>
            <option value="probate">Probate</option>
          </select>
        </Field>
        <Field label="Ratification date *">
          <input
            type="date"
            name="ratification_date"
            required
            value={ratification}
            onChange={(e) => setRatification(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
        </Field>
        <Field label="Days to close escrow *">
          <input
            type="number"
            name="days_to_close"
            required
            min={1}
            max={120}
            value={daysToClose}
            onChange={(e) => setDaysToClose(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
        </Field>
        <Field label="Rent-back days">
          <input
            type="number"
            name="rent_back_days"
            min={0}
            max={90}
            defaultValue={0}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
        </Field>
        <Field label="Sale price">
          <input
            type="number"
            name="sale_price"
            min={0}
            step="1000"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
        </Field>

        <div className="sm:col-span-2">
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: T.canvas, border: `1px dashed ${T.gold}` }}
          >
            <span style={{ color: T.muted }}>Computed COE: </span>
            <span className="font-medium" style={{ color: T.goldDeep }}>
              {coePreview ? fmtLong(coePreview) : "—"}
            </span>
          </div>
        </div>

        {sellerType !== "normal" && (
          <div
            className="rounded-lg px-3 py-2 text-xs sm:col-span-2"
            style={{ background: `${T.gold}18`, color: T.goldDeep }}
          >
            Estate/trust bank account, Letters Testamentary / trust certificate, and
            supplemental-tax tasks will be added.
          </div>
        )}

        {state.error && (
          <p className="text-sm sm:col-span-2" style={{ color: T.red }}>
            {state.error}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ background: T.ink, color: T.gold }}
          >
            {pending ? "Generating…" : "Generate transaction & task list"}
          </button>
        </div>
      </form>
    </section>
  );
}
