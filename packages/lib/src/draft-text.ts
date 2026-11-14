// Plain-text helpers for drafts a person sends themselves: the console's staff
// drafts (S6b) and the members' drafts in /my (S5b PR 3). No model code here.

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/**
 * A mailto: link with the subject and body filled in, for the person's own
 * mail app. Addresses come from our records or the person, never from the
 * model; anything that isn't a plain address is left out.
 */
export function mailtoHref(to: string[], subject: string, body: string): string {
  const addresses = to.map((a) => a.trim()).filter((a) => EMAIL.test(a));
  const query = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`].join("&");
  return `mailto:${addresses.map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",")}?${query}`;
}

/** A plain email address (what mailtoHref keeps). */
export const isPlainEmail = (s: string) => EMAIL.test(s.trim());

/** First name for a greeting: "Dana Example, Trustee of …" → "Dana". */
export function firstName(full: string | null | undefined): string | null {
  const word = (full ?? "").trim().split(/[\s,]+/)[0] ?? "";
  return /^[\p{L}][\p{L}'’-]{0,39}$/u.test(word) ? word : null;
}

/**
 * Free text someone typed (a lead's message, a task title, a member's notes)
 * can hold an email address or phone number; contact details never go to the
 * model.
 */
export function redactContacts(text: string): string {
  return text
    .replace(/[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
}
