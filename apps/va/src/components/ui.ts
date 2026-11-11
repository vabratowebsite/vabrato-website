import { cx, focusLight } from "@vabrato/ui/web";

// Form and button classes for the console, on the web design tokens (S6).
// Square corners, navy primary, 44px targets, visible focus (WCAG 2.2 AA).

export const inputCls = cx(
  "block w-full min-h-[44px] border border-muted bg-white px-3 py-2 font-body text-body-sm text-ink",
  "focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy",
);

export const labelCls = "block font-body text-body-sm font-medium text-ink";

const base = cx("inline-flex min-h-[44px] items-center justify-center gap-2 px-5 py-2 font-body text-[12px] font-medium uppercase tracking-label disabled:opacity-60", focusLight);

export const btnPrimary = cx(base, "border border-navy bg-navy text-white hover:bg-navy-deep");
export const btnSecondary = cx(base, "border border-navy bg-white text-navy hover:bg-navy-50");
export const btnDanger = cx(base, "border border-red bg-white text-red hover:bg-red-50");
/** Small text-style action inside lists (Remove, Messages). */
export const linkAction = cx("inline-flex min-h-[44px] items-center px-2 font-body text-body-sm text-navy underline", focusLight);
export const linkDanger = cx("inline-flex min-h-[44px] items-center px-2 font-body text-body-sm text-red underline", focusLight);

export const errorCls = "font-body text-body-sm font-medium text-red";
export const okCls = "font-body text-body-sm font-medium text-green";
export const mutedCls = "font-body text-body-sm text-muted";
