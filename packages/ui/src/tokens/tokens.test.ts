import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AA,
  ALLOWED_PAIRS,
  DISALLOWED_PAIRS,
  LEGACY_GOLD_INK,
  contrastRatio,
  pairPasses,
  pairRatio,
} from "./contrast";
import { colors } from "./tokens";
import { T } from "../theme";

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#151B5C", "#FFFFFF")).toBeCloseTo(15.63, 1);
  });

  it("is symmetric", () => {
    expect(contrastRatio(colors.gold, colors.navy)).toBe(contrastRatio(colors.navy, colors.gold));
  });

  it("rejects malformed colors", () => {
    expect(() => contrastRatio("navy", "#FFFFFF")).toThrow();
  });
});

describe("token contrast (WCAG 2.2 AA)", () => {
  it.each(ALLOWED_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.use})`, p] as const))(
    "%s passes",
    (_name, p) => {
      expect(pairRatio(p)).toBeGreaterThanOrEqual(AA[p.use]);
    },
  );

  it.each(DISALLOWED_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.use})`, p] as const))(
    "%s fails and stays disallowed",
    (_name, p) => {
      expect(pairPasses(p)).toBe(false);
    },
  );

  it("documents why gold-ink was darkened", () => {
    expect(contrastRatio(LEGACY_GOLD_INK, colors.white)).toBeLessThan(AA.text);
    expect(contrastRatio(colors["gold-ink"], colors.white)).toBeGreaterThanOrEqual(AA.text);
  });

  it("no pair is both allowed and disallowed", () => {
    const key = (p: { fg: string; bg: string; use: string }) => `${p.fg}|${p.bg}|${p.use}`;
    const allowed = new Set(ALLOWED_PAIRS.map(key));
    for (const p of DISALLOWED_PAIRS) expect(allowed.has(key(p))).toBe(false);
  });
});

describe("tokens.css", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

  it("declares every color token with the same value as tokens.ts", () => {
    for (const [name, hex] of Object.entries(colors)) {
      const m = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(css);
      expect(m, `--color-${name} missing`).not.toBeNull();
      expect(m![1]!.toUpperCase()).toBe(hex.toUpperCase());
    }
  });

  it("declares no colors that tokens.ts lacks", () => {
    const declared = [...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual(Object.keys(colors).sort());
  });
});

describe("legacy VA tokens", () => {
  it("are still exported unchanged for apps/va", () => {
    expect(T.ink).toBe("#1C1A17");
    expect(T.gold).toBe("#C6A15B");
  });
});
