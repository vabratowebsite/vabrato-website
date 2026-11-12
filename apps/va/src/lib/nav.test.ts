import { describe, expect, it } from "vitest";
import { consoleNav, signedInAs } from "./nav";

describe("console nav", () => {
  it("lists the existing pages in Staff, Website, Reports, Transactions and Account groups", () => {
    const nav = consoleNav("deals");
    expect(nav.map((g) => g.label)).toEqual(["Staff", "Website", "Reports", "Transactions", "Account"]);
    expect(nav.flatMap((g) => g.items.map((i) => i.href))).toEqual([
      "/",
      "/leads",
      "/members",
      "/messages",
      "/listings",
      "/open-houses",
      "/mls",
      "/assistant",
      "/content",
      "/featured",
      "/reports",
      "/stats",
      "/cmas",
      "/presentations",
      "/deals",
      "/vendors",
      "/profile",
      "/settings",
    ]);
    expect(nav.flatMap((g) => g.items).filter((i) => i.current).map((i) => i.key)).toEqual(["deals"]);
  });

  it("badges new leads", () => {
    expect(consoleNav("today", { newLeads: 4 }).flatMap((g) => g.items).find((i) => i.key === "leads")?.count).toBe(4);
  });

  it("badges unread messages only when there are some", () => {
    const messages = (n?: number) => consoleNav("today", { unreadMessages: n }).flatMap((g) => g.items).find((i) => i.key === "messages");
    expect(messages(3)?.count).toBe(3);
    expect(messages(0)).not.toHaveProperty("count");
  });

  it("labels the signed-in person", () => {
    expect(signedInAs("Mark Martinho", "m@example.test", "admin")).toBe("Mark Martinho · Admin");
    expect(signedInAs(" ", "va@example.test", "va")).toBe("va@example.test · VA");
  });
});
