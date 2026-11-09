import { colors, type ColorToken } from "./tokens";

/** WCAG 2.x relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB color: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** AA thresholds: 4.5 normal text, 3 large text (≥24px / ≥18.66px bold) and UI components. */
export const AA = { text: 4.5, large: 3, ui: 3 } as const;

export type PairUse = keyof typeof AA;

export interface TokenPair {
  fg: ColorToken;
  bg: ColorToken;
  use: PairUse;
  note: string;
}

/** Every foreground/background pair the components use. All must pass. */
export const ALLOWED_PAIRS: TokenPair[] = [
  { fg: "navy", bg: "white", use: "text", note: "Headings, links, outline buttons" },
  { fg: "navy", bg: "soft", use: "text", note: "Headings on soft bands" },
  { fg: "ink", bg: "white", use: "text", note: "Body copy" },
  { fg: "ink", bg: "soft", use: "text", note: "Body copy on soft bands" },
  { fg: "muted", bg: "white", use: "text", note: "Secondary text, captions" },
  { fg: "muted", bg: "soft", use: "text", note: "Captions on soft bands" },
  { fg: "gold-ink", bg: "white", use: "text", note: "Eyebrow labels, AI labels" },
  { fg: "gold-ink", bg: "soft", use: "text", note: "Eyebrows on soft bands" },
  { fg: "gold-ink", bg: "gold-50", use: "text", note: "AI draft / AI concept labels" },
  { fg: "white", bg: "navy", use: "text", note: "Navy bands, sidebar, navy buttons" },
  { fg: "white", bg: "navy-deep", use: "text", note: "Footer, deep bands" },
  { fg: "gold", bg: "navy", use: "text", note: "Gold accents on navy" },
  { fg: "gold", bg: "navy-deep", use: "text", note: "Gold accents on navy-deep" },
  { fg: "white", bg: "charcoal", use: "text", note: "LISTING NO. bar" },
  { fg: "gold", bg: "charcoal", use: "text", note: "Gold on listing bar" },
  { fg: "navy", bg: "gold", use: "text", note: "Gold buttons" },
  { fg: "ink", bg: "gold", use: "text", note: "NEW / OPEN badges" },
  { fg: "white", bg: "red", use: "text", note: "SOLD badges" },
  { fg: "red", bg: "white", use: "text", note: "Error text" },
  { fg: "red", bg: "red-50", use: "text", note: "Wiring banner, price-drop pill" },
  { fg: "green", bg: "white", use: "text", note: "Success text" },
  { fg: "green", bg: "green-50", use: "text", note: "Status pills" },
  { fg: "navy", bg: "navy-50", use: "text", note: "Neutral pills" },
  { fg: "muted", bg: "white", use: "ui", note: "Form field borders (SC 1.4.11)" },
  { fg: "gold", bg: "navy", use: "ui", note: "Focus ring on dark" },
  { fg: "navy", bg: "white", use: "ui", note: "Focus ring on light" },
];

/** Pairs that fail AA and must not be used for text or controls (decorative only). */
export const DISALLOWED_PAIRS: TokenPair[] = [
  { fg: "gold", bg: "white", use: "text", note: "2.08:1 — gold is a fill/rule color on light" },
  { fg: "gold", bg: "soft", use: "text", note: "Gold text on soft fails" },
  { fg: "muted", bg: "navy", use: "text", note: "3.08:1 — use white/80 on navy" },
  {
    fg: "line",
    bg: "white",
    use: "ui",
    note: "1.27:1 — decorative hairlines only, not field borders",
  },
];

/** The original brand gold-ink, kept for documentation: fails AA for small text. */
export const LEGACY_GOLD_INK = "#B8862B";

export function pairRatio(p: TokenPair): number {
  return contrastRatio(colors[p.fg], colors[p.bg]);
}

export function pairPasses(p: TokenPair): boolean {
  return pairRatio(p) >= AA[p.use];
}
