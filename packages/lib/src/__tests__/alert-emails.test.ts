import { describe, expect, it } from "vitest";
import { renderAlertEmail, unsubscribeUrls } from "../alert-emails";
import { VABRATO_POSTAL_ADDRESS } from "../mls-legal";
import { ALERT_TEMPLATE_KEYS, processDueNotifications, renderNotification, type DueNotification, type OutboundEmail } from "../notifications";

// Buyer alert emails (S5 PR 3): static templates, IDX-only content, MLS
// attribution, postal address and one-click unsubscribe. Fictional data.

const TOKEN = "1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b";
const SITE = "https://vabrato.com";
const items = [
  { title: "1 Fiction St", city: "San Carlos", price: 1800000, kind: "new_match", search: "San Carlos 3bd+", path: "/listing/FX-101", broker: "Example Realty" },
  { title: "Home in Los Gatos", city: "Los Gatos", price: 2500000, kind: "new_match", search: "Los Gatos", path: "/listing/FX-102", broker: "Example Realty" },
  { title: "7 Sample Ct", city: "Belmont", price: 1900000, kind: "price_drop", search: null, path: "/listing/FX-103", broker: null },
];
const payload = (over: Record<string, unknown> = {}) => ({ first_name: "Jordan", items, more: 0, unsubscribe_token: TOKEN, ...over });

describe("alert emails", () => {
  it("lists each home with its link, new price and listing broker", () => {
    const e = renderAlertEmail("instant", payload(), { siteUrl: SITE, year: 2026 });
    expect(e.subject).toBe("3 updates on homes you're following");
    expect(e.body).toContain(`Hi Jordan,`);
    expect(e.body).toContain(`• New listing for "San Carlos 3bd+": 1 Fiction St, San Carlos · $1,800,000`);
    expect(e.body).toContain(`${SITE}/listing/FX-101`);
    expect(e.body).toContain("Listing courtesy of Example Realty");
    expect(e.body).toContain("• Price reduced: 7 Sample Ct, Belmont · now $1,900,000");
    // Our own listing (broker null) carries no courtesy line.
    expect(e.body.split("\n").filter((l) => l.includes("courtesy")).length).toBe(2);
  });

  it("shows hidden-address homes by city only", () => {
    const e = renderAlertEmail("instant", payload(), { siteUrl: SITE });
    expect(e.body).toContain("New listing for \"Los Gatos\": Home in Los Gatos · $2,500,000");
  });

  it("carries the MLS disclaimer, postal address and one-click unsubscribe", () => {
    const e = renderAlertEmail("instant", payload(), { siteUrl: SITE, year: 2026 });
    expect(e.body).toContain("Listing information © 2026 MLSListings Inc.");
    expect(e.body).toContain(VABRATO_POSTAL_ADDRESS);
    const urls = unsubscribeUrls(SITE, TOKEN);
    expect(e.body).toContain(`Unsubscribe: ${urls.page}`);
    expect(e.headers).toEqual({ "List-Unsubscribe": `<${urls.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("names a single update in the subject, and counts extra homes", () => {
    expect(renderAlertEmail("instant", payload({ items: [items[2]] }), { siteUrl: SITE }).subject).toBe("Price reduced: 7 Sample Ct");
    const e = renderAlertEmail("digest", payload({ more: 4 }), { siteUrl: SITE });
    expect(e.subject).toBe("Your daily home digest: 7 updates");
    expect(e.body).toContain("…and 4 more in your portal");
  });

  it("never prints a previous or sold price, even if one sneaks into the payload", () => {
    const e = renderAlertEmail("instant", payload({ items: [{ ...items[2], old_price: 2000000, close_price: 2100000 }] }), { siteUrl: SITE });
    expect(e.body).not.toMatch(/2,000,000|2,100,000/);
  });

  it("refuses malformed payloads (no token, no items, odd links)", () => {
    expect(() => renderAlertEmail("instant", payload({ unsubscribe_token: "x" }), { siteUrl: SITE })).toThrow();
    expect(() => renderAlertEmail("instant", payload({ items: [] }), { siteUrl: SITE })).toThrow();
    expect(() => renderAlertEmail("instant", payload({ items: [{ ...items[0], path: "https://evil.example" }] }), { siteUrl: SITE })).toThrow();
  });

  it("is registered with the notification pipeline", () => {
    expect([...ALERT_TEMPLATE_KEYS]).toEqual(["buyer_alert_instant", "buyer_alert_digest"]);
    expect(renderNotification("buyer_alert_digest", payload(), { siteUrl: SITE }).subject).toMatch(/daily home digest/);
  });
});

describe("processor with alert emails", () => {
  const run = async (due: DueNotification[]) => {
    const sent: OutboundEmail[] = [];
    const log: string[] = [];
    const result = await processDueNotifications({
      fetchDue: async () => due,
      send: async (e) => {
        sent.push(e);
        return { error: null };
      },
      markSent: async (id) => void log.push(`sent:${id}`),
      markFailed: async (id, r) => void log.push(`failed:${id}:${r}`),
      markCancelled: async (id) => void log.push(`cancelled:${id}`),
      siteUrl: "https://preview.vabrato.test/",
    });
    return { result, sent, log };
  };

  it("sends alert emails with their unsubscribe headers and site links", async () => {
    const { result, sent } = await run([{ id: "n1", template_key: "buyer_alert_instant", payload: payload(), recipientEmail: "jordan@example.test" }]);
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]!.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent[0]!.body).toContain("https://preview.vabrato.test/listing/FX-101");
  });

  it("cancels alert emails for members who opted out after they were queued", async () => {
    const { result, sent, log } = await run([
      { id: "n2", template_key: "buyer_alert_instant", payload: payload(), recipientEmail: "jordan@example.test", alertsOptedOut: true },
      { id: "n3", template_key: "seller_welcome", payload: { address: "10 Fiction Rd", coe: "Mar 11, 2026" }, recipientEmail: "avery@example.test", alertsOptedOut: true },
    ]);
    expect(result).toEqual({ sent: 1, failed: 0, cancelled: 1 });
    expect(log).toEqual(["cancelled:n2", "sent:n3"]);
    expect(sent.map((s) => s.to)).toEqual(["avery@example.test"]);
  });

  it("fails a malformed alert payload instead of sending it", async () => {
    const { result, log } = await run([{ id: "n4", template_key: "buyer_alert_instant", payload: { items: [] }, recipientEmail: "jordan@example.test" }]);
    expect(result.failed).toBe(1);
    expect(log[0]).toMatch(/^failed:n4/);
  });
});
