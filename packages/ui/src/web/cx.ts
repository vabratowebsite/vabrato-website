/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared focus ring classes: navy on light surfaces, gold on dark. */
export const focusLight =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";
export const focusDark =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** Uppercase label style used by eyebrows, buttons and nav. */
export const labelCaps = "font-body text-label uppercase tracking-label";
