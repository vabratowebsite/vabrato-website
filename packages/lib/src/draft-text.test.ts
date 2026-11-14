import { describe, expect, it } from "vitest";
import { firstName, isPlainEmail, mailtoHref, redactContacts } from "./draft-text";

// Shared by the console's staff drafts and the members' drafts. Fictional data.

describe("draft text helpers", () => {
  it("redacts emails and phone numbers", () => {
    expect(redactContacts("Call 650.555.0199, +1 (650) 555-0100 or a@b.co")).toBe("Call [phone], [phone] or [email]");
    expect(redactContacts("Close on 2026-04-01, 30 days")).toBe("Close on 2026-04-01, 30 days");
  });

  it("mailto: only plain addresses, subject and body encoded, line breaks as CRLF", () => {
    const href = mailtoHref(["jordan@example.test", "bad address", "x@y"], "Re: 12 Fictional Lane & more", "Hi Jordan,\n\nSee you Saturday.");
    expect(href).toBe("mailto:jordan@example.test?subject=Re%3A%2012%20Fictional%20Lane%20%26%20more&body=Hi%20Jordan%2C%0D%0A%0D%0ASee%20you%20Saturday.");
    expect(mailtoHref([], "S", "B")).toBe("mailto:?subject=S&body=B");
    expect([isPlainEmail(" movers@example.test "), isPlainEmail("a@b"), isPlainEmail("x y@example.test")]).toEqual([true, false, false]);
  });

  it("first names for greetings", () => {
    expect(firstName("Dana Example, Trustee of the Example Family Trust")).toBe("Dana");
    expect(firstName("  Ana-María López")).toBe("Ana-María");
    expect(firstName("")).toBeNull();
    expect(firstName("jordan@example.test")).toBeNull();
  });
});
