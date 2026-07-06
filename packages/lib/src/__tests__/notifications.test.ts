import { describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_TEMPLATE_KEYS,
  buildSellerNotificationRows,
  processDueNotifications,
  renderNotification,
  type DueNotification,
} from "../notifications";
import { generateSchedule } from "../schedule";

const MERGE = {
  address: "501 W Fox Ct, Redwood City",
  sellerName: "Dana",
  coe: "Mar 11, 2026",
  rentBackEnd: "Apr 10, 2026",
};

describe("renderNotification", () => {
  it("renders every registered template with merge fields", () => {
    for (const key of NOTIFICATION_TEMPLATE_KEYS) {
      const email = renderNotification(key, MERGE);
      expect(email.subject).toContain("501 W Fox Ct");
      expect(email.body).toContain("Dana");
      expect(email.body.length).toBeGreaterThan(50);
    }
  });

  it("includes the wiring-safety line in pre-closing emails", () => {
    for (const key of ["seller_welcome", "seller_signing_reminder", "seller_closing_tomorrow"]) {
      expect(renderNotification(key, MERGE).body).toMatch(/NEVER email you wiring instructions/);
    }
  });

  it("throws on unknown template keys (no dynamic content, ever)", () => {
    expect(() => renderNotification("marketing_blast", MERGE)).toThrow(/Unknown notification/);
  });
});

describe("buildSellerNotificationRows", () => {
  const schedule = generateSchedule({
    ratificationDate: "2026-02-24",
    daysToClose: 15,
    sellerType: "normal",
    rentBackDays: 30,
  });

  it("maps schedule notifications to rows with 16:00Z send times", () => {
    const rows = buildSellerNotificationRows(schedule, MERGE, "2026-01-01");
    expect(rows).toHaveLength(5); // 4 standard + rent-back
    expect(rows[0]).toEqual({
      template_key: "seller_welcome",
      send_at: "2026-02-25T16:00:00.000Z",
      payload: MERGE,
    });
  });

  it("drops sends whose date has already passed", () => {
    const rows = buildSellerNotificationRows(schedule, MERGE, "2026-03-10");
    expect(rows.map((r) => r.template_key)).toEqual([
      "seller_closing_tomorrow",
      "seller_post_coe_checklist",
      "seller_rent_back_ending",
    ]);
  });
});

describe("processDueNotifications", () => {
  function deps(due: DueNotification[], sendError: string | null = null) {
    return {
      fetchDue: vi.fn().mockResolvedValue(due),
      send: vi.fn().mockResolvedValue({ error: sendError }),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
  }
  const row: DueNotification = {
    id: "n1",
    template_key: "seller_welcome",
    payload: MERGE,
    recipientEmail: "dana@example.com",
  };

  it("sends due notifications and marks them sent", async () => {
    const d = deps([row]);
    expect(await processDueNotifications(d)).toEqual({ sent: 1, failed: 0 });
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dana@example.com", subject: expect.stringContaining("501 W Fox Ct") }),
    );
    expect(d.markSent).toHaveBeenCalledWith("n1");
  });

  it("marks failed on send error and on missing recipient", async () => {
    const failing = deps([row], "smtp down");
    expect(await processDueNotifications(failing)).toEqual({ sent: 0, failed: 1 });
    expect(failing.markFailed).toHaveBeenCalledWith("n1", "smtp down");

    const noEmail = deps([{ ...row, recipientEmail: null }]);
    expect(await processDueNotifications(noEmail)).toEqual({ sent: 0, failed: 1 });
  });

  it("marks failed on unknown template without sending", async () => {
    const d = deps([{ ...row, template_key: "bogus" }]);
    expect(await processDueNotifications(d)).toEqual({ sent: 0, failed: 1 });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is due", async () => {
    expect(await processDueNotifications(deps([]))).toEqual({ sent: 0, failed: 0 });
  });
});
