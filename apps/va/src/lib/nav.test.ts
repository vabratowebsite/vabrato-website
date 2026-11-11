import { describe, expect, it } from "vitest";
import { consoleNav, signedInAs } from "./nav";

describe("console nav", () => {
  it("lists the existing pages in Staff and Transactions groups", () => {
    const nav = consoleNav("deals");
    expect(nav.map((g) => g.label)).toEqual(["Staff", "Transactions"]);
    expect(nav.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/", "/messages", "/open-houses", "/deals", "/vendors"]);
    expect(nav.flatMap((g) => g.items).filter((i) => i.current).map((i) => i.key)).toEqual(["deals"]);
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
