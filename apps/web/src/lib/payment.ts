// Monthly payment ESTIMATE (review item 13): shown with its assumptions and
// labeled "estimate, not a loan offer". Never presented as an appraisal or a
// loan quote. Assumptions are editable by the visitor.

export interface PaymentAssumptions {
  downPaymentPct: number;
  /** Annual interest rate, percent. */
  ratePct: number;
  years: number;
  /** Annual property tax as a percent of price (California base 1% plus local levies). */
  taxRatePct: number;
  /** Homeowners insurance, dollars per year. */
  insurancePerYear: number;
  /** HOA dues, dollars per month (from the listing when known). */
  hoaPerMonth: number;
}

export const DEFAULT_ASSUMPTIONS: Omit<PaymentAssumptions, "hoaPerMonth"> = {
  downPaymentPct: 20,
  ratePct: 6.4,
  years: 30,
  taxRatePct: 1.1,
  insurancePerYear: 1500,
};

export interface PaymentEstimate {
  principalAndInterest: number;
  taxes: number;
  insurance: number;
  hoa: number;
  total: number;
  loanAmount: number;
}

export function estimatePayment(price: number, a: PaymentAssumptions): PaymentEstimate {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  const down = clamp(a.downPaymentPct, 0, 100) / 100;
  const loanAmount = Math.max(0, price * (1 - down));
  const n = Math.round(clamp(a.years, 1, 40) * 12);
  const r = clamp(a.ratePct, 0, 25) / 100 / 12;
  const principalAndInterest = loanAmount === 0 ? 0 : r === 0 ? loanAmount / n : (loanAmount * r) / (1 - (1 + r) ** -n);
  const taxes = (price * clamp(a.taxRatePct, 0, 5)) / 100 / 12;
  const insurance = clamp(a.insurancePerYear, 0, 100_000) / 12;
  const hoa = clamp(a.hoaPerMonth, 0, 100_000);
  const round = (v: number) => Math.round(v);
  return {
    principalAndInterest: round(principalAndInterest),
    taxes: round(taxes),
    insurance: round(insurance),
    hoa: round(hoa),
    total: round(principalAndInterest + taxes + insurance + hoa),
    loanAmount: round(loanAmount),
  };
}

/** Monthly HOA dues from the IDX fields (AssociationFee + AssociationFeeFrequency). */
export function monthlyHoa(fee: unknown, frequency: unknown): number {
  const v = typeof fee === "number" ? fee : Number(fee);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const f = String(frequency ?? "Monthly").toLowerCase();
  if (f.startsWith("annual") || f.startsWith("year")) return v / 12;
  if (f.startsWith("quarter")) return v / 3;
  if (f.startsWith("semi")) return v / 6;
  return v;
}
