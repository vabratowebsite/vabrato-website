// Vabrato web design tokens (S2). Source of truth for apps/web and, later,
// apps/va. tokens.css mirrors these values as CSS variables; a test keeps
// the two in sync. The legacy VA palette `T` lives in ../theme.ts.

export const colors = {
  navy: "#151B5C",
  "navy-deep": "#0E1347",
  gold: "#E8A90C",
  // Gold text on light backgrounds. Darkened from the brand's #B8862B
  // (3.24:1 on white, fails AA) to pass 4.5:1 for small text.
  "gold-ink": "#8F6A1F",
  ink: "#1D1D1F",
  muted: "#6E6E73",
  line: "#E4E4E8",
  soft: "#F6F6F8",
  charcoal: "#222222",
  white: "#FFFFFF",
  red: "#B42318",
  "red-50": "#FDECEA",
  green: "#1E7A3C",
  "green-50": "#E7F4EC",
  "gold-50": "#FEF6E0",
  "navy-50": "#E8E9F3",
} as const;

export type ColorToken = keyof typeof colors;

/** CSS variables set by next/font in the app; fallbacks keep packages usable without it. */
export const fonts = {
  display: "var(--font-display), 'Bodoni Moda', Didot, 'Times New Roman', serif",
  subhead: "var(--font-subhead), 'Libre Baskerville', Georgia, serif",
  body: "var(--font-body), Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/** Type scale in px: [size, lineHeight]. */
export const typeScale = {
  "display-xl": [64, 1.02],
  "display-lg": [48, 1.05],
  "display-md": [36, 1.1],
  "display-sm": [28, 1.15],
  "subhead-lg": [24, 1.3],
  "subhead-md": [20, 1.35],
  "subhead-sm": [18, 1.4],
  "body-lg": [18, 1.6],
  body: [16, 1.6],
  "body-sm": [14, 1.55],
  caption: [12, 1.5],
  label: [11, 1.4],
} as const;

/** 4px spacing scale (px). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

/** Letter-spacing for uppercase labels, buttons and display type. */
export const tracking = {
  display: "0.02em",
  label: "0.12em",
  wide: "0.2em",
} as const;

export const radii = { none: "0", sm: "2px", md: "4px", pill: "999px" } as const;

export const shadows = {
  card: "0 1px 2px rgba(14,19,71,0.06), 0 4px 16px rgba(14,19,71,0.06)",
  pop: "0 8px 30px rgba(14,19,71,0.15)",
} as const;

/** CSS variable name for a color token, e.g. `--color-navy-deep`. */
export const colorVar = (name: ColorToken) => `--color-${name}`;
