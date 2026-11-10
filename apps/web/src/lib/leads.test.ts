import { describe, expect, it } from "vitest";
import { clientIp, hashIp, leadRow, parseLeadForm, verifyTurnstile } from "./leads";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("lead forms", () => {
  it("parses a tour request with its payload fields only", () => {
    const r = parseLeadForm(
      form({ kind: "tour", email: " Visitor@Example.TEST ", name: "Avery", listingKey: "FX-001", tourDate: "2026-11-12", tourMode: "video", consentContact: "on", sneaky: "x" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead).toMatchObject({ kind: "tour", email: "visitor@example.test", consentContact: true, payload: { tourDate: "2026-11-12", tourMode: "video" } });
    expect(r.honeypot).toBe(false);
    expect(leadRow(r.lead, null)).toMatchObject({ listing_key: "FX-001", consent_contact: true, ip_hash: null, site: "vabrato" });
  });

  it("reports field errors", () => {
    const r = parseLeadForm(form({ kind: "contact", email: "nope", phone: "call me" }));
    expect(r).toEqual({ ok: false, fieldErrors: { email: "Enter a valid email address.", phone: "Enter a valid phone number." } });
    expect(parseLeadForm(form({ kind: "spam", email: "a@example.test" }))).toMatchObject({ ok: false, fieldErrors: { kind: expect.any(String) } });
  });

  it("flags the honeypot and defaults consent to no", () => {
    const r = parseLeadForm(form({ kind: "contact", email: "a@example.test", website: "http://spam.example" }));
    expect(r).toMatchObject({ ok: true, honeypot: true, lead: { consentContact: false } });
  });

  it("hashes IPs with a salt and never without one", () => {
    expect(hashIp("203.0.113.7", undefined)).toBeNull();
    const h = hashIp("203.0.113.7", "salt");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("verifies Turnstile only when configured", async () => {
    expect(await verifyTurnstile(null, null, undefined)).toBe(true);
    expect(await verifyTurnstile(null, null, "secret")).toBe(false);
    const ok = (async () => Response.json({ success: true })) as unknown as typeof fetch;
    const bad = (async () => Response.json({ success: false })) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "203.0.113.7", "secret", ok)).toBe(true);
    expect(await verifyTurnstile("tok", null, "secret", bad)).toBe(false);
  });
});
