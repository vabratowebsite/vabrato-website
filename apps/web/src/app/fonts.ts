import localFont from "next/font/local";

// Brand fonts (SPEC <brand>). Exposed as CSS variables consumed by the
// @vabrato/ui Tailwind preset: font-display / font-subhead / font-body.
//
// Self-hosted (2026-11-13): the Latin variable fonts Google Fonts serves,
// kept in ./fonts with their licenses (SIL Open Font License 1.1), so builds
// never download fonts (a failed download used to fail the build). Same
// files in apps/va.
export const display = localFont({
  src: [{ path: "./fonts/bodoni-moda-latin.woff2", weight: "400 900", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const subhead = localFont({
  src: [
    { path: "./fonts/libre-baskerville-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/libre-baskerville-italic-latin.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-subhead",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const body = localFont({
  src: [{ path: "./fonts/roboto-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const fontVariables = `${display.variable} ${subhead.variable} ${body.variable}`;
