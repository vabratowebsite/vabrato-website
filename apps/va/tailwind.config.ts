import type { Config } from "tailwindcss";
import vabrato from "@vabrato/ui/tailwind-preset";

// Same brand tokens as apps/web (packages/ui, S2). The legacy warm `T`
// palette is no longer used by the console (S6).
export default {
  presets: [vabrato],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  plugins: [],
} satisfies Config;
