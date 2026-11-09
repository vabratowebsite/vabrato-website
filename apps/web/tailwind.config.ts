import type { Config } from "tailwindcss";

// Brand tokens (navy, gold, Bodoni Moda / Libre Baskerville / Roboto) arrive in S2
// via packages/ui. Until then only the two brand colors are defined here.
export default {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#151B5C",
        gold: "#E8A90C",
      },
    },
  },
  plugins: [],
} satisfies Config;
