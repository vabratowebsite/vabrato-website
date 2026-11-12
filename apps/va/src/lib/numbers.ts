// Numbers in text the assistant wrote, checked against the numbers we sent
// (S6b PR 6; shared with PR 7b). Our code computes or the agent types every
// figure; the assistant may only repeat them.

/** Every number in a JSON value (recursing), plus percentages of ratios (1.023 → 102.3). */
export function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(value);
    if (Math.abs(value) < 10) out.push(value * 100);
  } else if (typeof value === "string") {
    for (const n of numbersInText(value)) out.push(n.value);
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

/** Numbers as written in text: $1,950,000 · 1.95M · $2.1 million · 102.3% · 18. */
export function numbersInText(text: string): { raw: string; value: number; plain: boolean }[] {
  const out: { raw: string; value: number; plain: boolean }[] = [];
  const re = /\$?\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?(million|thousand|[mk])\b)?%?/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    let value = Number(raw.replace(/[$,%]/g, "").replace(/\s?(million|thousand|[mk])$/i, ""));
    const unit = (m[1] ?? "").toLowerCase();
    if (unit === "million" || unit === "m") value *= 1e6;
    else if (unit === "thousand" || unit === "k") value *= 1e3;
    // A plain count: no $, %, unit or decimals ("3 bedrooms", "6 months").
    const plain = !/[$%.]/.test(raw) && !unit;
    if (Number.isFinite(value)) out.push({ raw: raw.trim(), value, plain });
  }
  return out;
}

/**
 * Numbers in the text that aren't among those we sent (within rounding),
 * ignoring years and plain small counts (0 to 12: "3 bedrooms", "6 months"),
 * never percentages or dollar amounts.
 */
export function numbersNotSent(text: string, sent: unknown): string[] {
  const allowed = numbersIn(sent);
  const ok = (n: { value: number; plain: boolean }) =>
    (n.plain && n.value >= 0 && n.value <= 12) || (n.plain && n.value >= 1990 && n.value <= 2100) || allowed.some((a) => Math.abs(n.value - a) <= Math.max(0.5, Math.abs(a) * 0.006));
  return [...new Set(numbersInText(text).filter((n) => !ok(n)).map((n) => n.raw))];
}

/**
 * Amounts or numbers written out in words ("fifteen hundred", "two thousand
 * dollars", "ten percent"), which the digit check can't see. Small counts in
 * words ("two items", "three bedrooms") are fine.
 */
export function numberWords(text: string): string[] {
  const units = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
  const re = new RegExp(`\\b(?:(?:${units})(?:[\\s-]+(?:${units}))*[\\s-]+(?:hundred|thousand|million|grand)\\b|(?:${units}|a|several)[\\s-]+(?:dollars?|bucks|percent|per\\s?cent)\\b|\\b(?:hundred|thousand|million)s?\\s+(?:of\\s+)?dollars?\\b)`, "gi");
  return [...new Set([...text.matchAll(re)].map((m) => m[0].toLowerCase()))];
}
