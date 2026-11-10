import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, estimatePayment, monthlyHoa } from "./payment";

describe("payment estimate", () => {
  it("amortizes a 30-year loan", () => {
    const est = estimatePayment(1_000_000, { ...DEFAULT_ASSUMPTIONS, hoaPerMonth: 0 });
    expect(est.loanAmount).toBe(800_000);
    // 800,000 at 6.4% for 30 years: standard formula, about $5,004/month.
    expect(est.principalAndInterest).toBe(5004);
    expect(est.taxes).toBe(917);
    expect(est.insurance).toBe(125);
    expect(est.total).toBe(5004 + 917 + 125);
  });

  it("handles zero interest, full cash and bad input", () => {
    expect(estimatePayment(360_000, { ...DEFAULT_ASSUMPTIONS, downPaymentPct: 0, ratePct: 0, hoaPerMonth: 0 }).principalAndInterest).toBe(1000);
    expect(estimatePayment(500_000, { ...DEFAULT_ASSUMPTIONS, downPaymentPct: 100, hoaPerMonth: 0 }).principalAndInterest).toBe(0);
    expect(estimatePayment(500_000, { ...DEFAULT_ASSUMPTIONS, downPaymentPct: Number.NaN, ratePct: -5, hoaPerMonth: -1 }).hoa).toBe(0);
  });

  it("normalizes HOA dues to monthly", () => {
    expect(monthlyHoa(450, "Monthly")).toBe(450);
    expect(monthlyHoa(1200, "Annually")).toBe(100);
    expect(monthlyHoa(900, "Quarterly")).toBe(300);
    expect(monthlyHoa(null, null)).toBe(0);
  });
});
