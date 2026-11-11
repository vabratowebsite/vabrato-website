import { describe, expect, it, vi } from "vitest";
import { processDueNotifications, renderNotification, resendSender } from "../notifications";
import { STAFF_TEMPLATE_KEYS, renderStaffEmail } from "../staff-emails";

const CTX = { siteUrl: "https://vabrato.com", consoleUrl: "https://console.vabrato.com" };
const LEAD = "6f1c2c1e-1d0a-4c7e-9a8b-0d3c3d9b7a11";
const MEMBER = "2b0f6d4e-5c3a-4f1b-8e7d-1a2b3c4d5e6f";
const lead = { leadId: LEAD, kind: "tour request", firstName: "Jordan", site: "vabrato" };

describe("staff and member notice emails (0022)", () => {
  it("link new leads to the console with a first name only", () => {
    const e = renderStaffEmail("staff_new_lead", lead, CTX);
    expect(e.subject).toBe("New tour request from Jordan");
    expect(e.body).toContain(`https://console.vabrato.com/leads/${LEAD}`);
    expect(e.body).toContain("vabrato.com");
    expect(e.body).toMatch(/no client details/);
    expect(renderStaffEmail("staff_new_lead", { ...lead, firstName: "", site: "sancarloslife" }, CTX).body).toMatch(/from a client came in on homes\.sancarloslife\.com/);
  });

  it("cover digests, reassignment, escalation, messages and sync alerts", () => {
    expect(renderStaffEmail("staff_lead_digest", { count: 3 }, CTX).subject).toBe("3 more new leads in the last 15 minutes");
    expect(renderStaffEmail("staff_lead_reassigned", lead, CTX).subject).toBe("Lead reassigned to you: tour request from Jordan");
    expect(renderStaffEmail("staff_lead_escalated", lead, CTX).subject).toBe("No reply yet: tour request from Jordan");
    expect(renderStaffEmail("staff_new_message", { memberId: MEMBER, firstName: "Riley" }, CTX).body).toContain(`https://console.vabrato.com/messages/${MEMBER}`);
    expect(renderStaffEmail("staff_sync_alert", { lastSuccess: "Nov 11, 9:46 AM" }, CTX).body).toContain("https://console.vabrato.com/mls");
    expect(renderStaffEmail("staff_sync_recovered", {}, CTX).subject).toBe("MLS sync is back to normal");
  });

  it("tell members about a message without its text, with the wiring warning and postal address", () => {
    const e = renderStaffEmail("member_new_message", {}, CTX);
    expect(e.body).toContain("https://vabrato.com/my/messages");
    expect(e.body).toMatch(/NEVER email you wiring instructions/);
    expect(e.body).toMatch(/935 Chestnut St/);
  });

  it("reject payloads that don't match (no free text, no links from the payload)", () => {
    expect(() => renderStaffEmail("staff_new_lead", { ...lead, leadId: "../../evil" }, CTX)).toThrow();
    expect(() => renderStaffEmail("staff_new_message", { memberId: "x", firstName: "R" }, CTX)).toThrow();
    expect(() => renderStaffEmail("staff_new_lead", { ...lead, firstName: "x".repeat(61) }, CTX)).toThrow();
  });

  it("are rendered by the pipeline with the console URL from the processor", async () => {
    expect([...STAFF_TEMPLATE_KEYS].sort()).toEqual([
      "member_new_message", "staff_lead_digest", "staff_lead_escalated", "staff_lead_reassigned", "staff_new_lead", "staff_new_message", "staff_sync_alert", "staff_sync_recovered",
    ]);
    expect(renderNotification("staff_new_lead", lead, { siteUrl: "https://vabrato.com" }).body).toContain("https://console.vabrato.com/leads/");
    const send = vi.fn().mockResolvedValue({ error: null });
    await processDueNotifications({
      fetchDue: async () => [{ id: "n1", template_key: "staff_new_lead", payload: lead, recipientEmail: "mark@example.test" }],
      send,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      consoleUrl: "http://localhost:3000/",
    });
    expect(send.mock.calls[0]![0].body).toContain(`http://localhost:3000/leads/${LEAD}`);
  });
});

describe("resendSender", () => {
  it("posts to Resend (or a QA base URL) with the idempotency key", async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const send = resendSender("re_test", "Vabrato <n@vabrato.com>", { baseUrl: "http://localhost:4010/", doFetch });
    expect(await send({ to: "mark@example.test", subject: "s", body: "b", idempotencyKey: "n1" })).toEqual({ error: null });
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:4010/emails");
    expect((init as RequestInit).headers).toMatchObject({ "Idempotency-Key": "n1", Authorization: "Bearer re_test" });
  });

  it("returns the error text on failure", async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    expect(await resendSender("k", "f", { doFetch })({ to: "a@example.test", subject: "s", body: "b" })).toEqual({ error: "Resend 429: rate limited" });
  });
});
