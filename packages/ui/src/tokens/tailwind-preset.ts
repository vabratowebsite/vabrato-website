import { colors, radii, typeScale, tracking, shadows } from "./tokens";

// Tailwind preset. Colors use the hex values (not the CSS variables) so
// opacity modifiers like `bg-navy/70` work; tokens.css carries the same
// values for non-Tailwind consumers. Fonts map to the next/font variables.

const fontSize: Record<string, [string, { lineHeight: string }]> = Object.fromEntries(
  Object.entries(typeScale).map(([k, [size, lh]]) => [
    k,
    [`${size / 16}rem`, { lineHeight: String(lh) }],
  ]),
);

const preset = {
  theme: {
    extend: {
      colors: { ...colors },
      fontFamily: {
        display: ["var(--font-display)", '"Bodoni Moda"', "Didot", '"Times New Roman"', "serif"],
        subhead: ["var(--font-subhead)", '"Libre Baskerville"', "Georgia", "serif"],
        body: ["var(--font-body)", "Roboto", "system-ui", "sans-serif"],
      },
      fontSize,
      letterSpacing: { ...tracking },
      boxShadow: { ...shadows },
      borderRadius: { pill: radii.pill },
      maxWidth: { site: "1200px" },
    },
  },
};

export default preset;
