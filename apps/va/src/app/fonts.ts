import { Bodoni_Moda, Libre_Baskerville, Roboto } from "next/font/google";

// Brand fonts (SPEC <brand>). Exposed as CSS variables consumed by the
// @vabrato/ui Tailwind preset: font-display / font-subhead / font-body.
export const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const subhead = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-subhead",
  display: "swap",
});

export const body = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

export const fontVariables = `${display.variable} ${subhead.variable} ${body.variable}`;
