import { describe, expect, it } from "vitest";
import { dueState } from "./dates";

describe("dueState", () => {
  it("labels done, overdue, due soon and scheduled tasks", () => {
    const today = "2026-11-11";
    expect(dueState("2026-11-01", true, today)).toEqual({ tone: "green", label: "Done" });
    expect(dueState("2026-11-10", false, today)).toEqual({ tone: "red", label: "Overdue" });
    expect(dueState("2026-11-14", false, today)).toEqual({ tone: "amber", label: "Due soon" });
    expect(dueState("2026-11-20", false, today)).toEqual({ tone: "muted", label: "Scheduled" });
  });
});
