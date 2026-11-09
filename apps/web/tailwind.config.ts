import type { Config } from "tailwindcss";
import vabrato from "@vabrato/ui/tailwind-preset";

// Brand tokens come from packages/ui (S2).
export default {
  presets: [vabrato],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  plugins: [],
} satisfies Config;
