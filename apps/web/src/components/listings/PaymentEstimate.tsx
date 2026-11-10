"use client";

import { useId, useState } from "react";
import { formatPrice } from "@/lib/format";
import { DEFAULT_ASSUMPTIONS, estimatePayment } from "@/lib/payment";

// Monthly payment estimate (mockup 03). Shows its assumptions, which the
// visitor can change, and says it is an estimate, not a loan offer (review
// item 13).

export function PaymentEstimate({ price, hoaPerMonth }: { price: number; hoaPerMonth: number }) {
  const id = useId();
  const [down, setDown] = useState(DEFAULT_ASSUMPTIONS.downPaymentPct);
  const [rate, setRate] = useState(DEFAULT_ASSUMPTIONS.ratePct);
  const est = estimatePayment(price, { ...DEFAULT_ASSUMPTIONS, downPaymentPct: down, ratePct: rate, hoaPerMonth });
  const parts = [
    { label: "Principal & interest", value: est.principalAndInterest, color: "bg-navy" },
    { label: "Taxes", value: est.taxes, color: "bg-gold" },
    { label: "Insurance", value: est.insurance, color: "bg-navy-50" },
    { label: "HOA", value: est.hoa, color: "bg-line" },
  ];
  return (
    <section aria-labelledby={`${id}-h`} className="border border-line p-6">
      <h2 id={`${id}-h`} className="font-body text-label font-medium uppercase tracking-label text-muted">
        Monthly payment estimate
      </h2>
      <p className="mt-2 font-subhead text-[32px] leading-none text-ink" aria-live="polite">
        {formatPrice(est.total)}
        <span className="font-body text-body-sm text-muted">/mo</span>
      </p>
      <div aria-hidden="true" className="mt-4 flex h-2 w-full overflow-hidden bg-line">
        {parts.map((p) => (
          <span key={p.label} className={p.color} style={{ width: `${est.total ? (p.value / est.total) * 100 : 0}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-body text-caption text-ink">
        {parts.map((p) => (
          <li key={p.label}>
            {p.label} {formatPrice(p.value)}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3 font-body text-body-sm">
        <label className="block">
          <span className="block text-ink">Down payment (%)</span>
          <input type="number" min={0} max={100} step={1} value={down} onChange={(e) => setDown(Number(e.target.value))} className="mt-1 min-h-[44px] w-full border border-muted px-2" />
        </label>
        <label className="block">
          <span className="block text-ink">Interest rate (%)</span>
          <input type="number" min={0} max={25} step={0.125} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-1 min-h-[44px] w-full border border-muted px-2" />
        </label>
      </div>
      <p className="mt-3 font-body text-caption text-muted">
        Estimate, not a loan offer. Assumes {DEFAULT_ASSUMPTIONS.years}-year fixed loan, property tax about {DEFAULT_ASSUMPTIONS.taxRatePct}% of price a year,
        insurance {formatPrice(DEFAULT_ASSUMPTIONS.insurancePerYear)} a year{hoaPerMonth ? ", HOA from the listing" : ""}. Your lender sets actual terms.
      </p>
    </section>
  );
}
