import { describe, expect, it } from "vitest";
import type { AiDeps, AiStore, ModelClient, ModelRequest } from "@vabrato/ai";
import { MEMBER_MESSAGES } from "./ask";
import {
  DRAFT_MESSAGES,
  cleanNotes,
  draftParts,
  draftSaveProblems,
  draftView,
  personalDetails,
  writeDraft,
  type DraftHome,
} from "./drafts";
import { DRAFT_LIMITS, MAX_AGENT_LINK, sendToAgentHref } from "./kinds";

// Ask Vabrato's drafts (S5b PR 3) without the network: what's sent, what's
// shown, and what's refused. Every name, address and number is fictional.

const SALE: DraftHome = {
  about: "88 Fixture Lane, Belmont",
  closeDate: "2026-12-04",
  dealId: "da000000-0000-4000-8000-0000000038d1",
};
const NAMES = { member: "Dana Example", agent: "Morgan" };

function deps(
  reply: unknown,
  gate: Awaited<ReturnType<AiStore["begin"]>> = { allowed: true, run_id: "run-1" },
) {
  const requests: ModelRequest[] = [];
  const began: (string | null)[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return {
        text: JSON.stringify(reply),
        citations: [],
        stop: "end",
        model: "claude-opus-5-5",
        usage: { inputTokens: 900, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
  const store: AiStore = {
    begin: async (_f, deal) => (began.push(deal ?? null), gate),
    finish: async () => undefined,
  };
  return { d: { store, model, log: () => undefined } as AiDeps, requests, began };
}
const sent = (r: ModelRequest[]) => JSON.stringify(r[0] ?? null);

const MOVERS = {
  subject: "Move after closing",
  body: "Hi,\n\nWe're closing on 88 Fixture Lane and would like a move the week after.\n\nThanks,\n[Your name]",
};

describe("a message draft", () => {
  it("sends the notes, who it's for, the address and closing date; nothing else about the member", async () => {
    const { d, requests, began } = deps(MOVERS);
    const card = await writeDraft(
      d,
      {
        kind: "message",
        recipient: "movers",
        notes:
          "A note to my movers for the week after closing. Call me at 650-555-0142 or dana@example.test.",
        home: SALE,
      },
      NAMES,
    );
    expect(card).toMatchObject({
      kind: "draft",
      draftKind: "message",
      recipient: "movers",
      about: SALE.about,
      subject: "Move after closing",
    });
    expect((card as { body: string }).body).toContain("Thanks,\nDana Example");
    const body = sent(requests);
    expect(body).toContain("88 Fixture Lane, Belmont");
    expect(body).toContain("Dec 4, 2026");
    expect(body).toContain("their movers");
    for (const never of ["Dana", "Example", "650-555-0142", "dana@example.test", "Morgan"])
      expect(body, never).not.toContain(never);
    expect(began).toEqual([SALE.dealId]); // ai_begin checks the member's access to their deal
  });

  it("no home: no address or date goes", async () => {
    const { d, requests } = deps(MOVERS);
    await writeDraft(
      d,
      {
        kind: "message",
        recipient: "contractor",
        notes: "Ask for a quote to repaint the fence.",
        home: null,
      },
      NAMES,
    );
    expect(sent(requests)).toContain("Not about a particular home");
    expect(sent(requests)).not.toContain("Fixture");
  });

  it("contacts in the answer are replaced; names fill the placeholders, or stay when unknown", () => {
    const v = draftView(
      {
        subject: "Hi [Agent's name]",
        body: "Reach me at 650.555.0199 or me@example.test.\n\n\n\nThanks, [Your name]",
      },
      { member: null, agent: "Morgan" },
    );
    expect(v).toEqual({
      subject: "Hi Morgan",
      body: "Reach me at [phone] or [email].\n\nThanks, [Your name]",
    });
    expect(draftView({ subject: "x", body: "y".repeat(5000) }, NAMES).body).toHaveLength(
      DRAFT_LIMITS.body,
    );
    expect(
      draftView({ subject: "x", body: "[Your name]" }, { member: "<script>", agent: null }).body,
    ).toBe("[Your name]");
  });

  it("notes keep line breaks, lose control characters, and are capped", () => {
    expect(cleanNotes("  one\r\n\r\n\r\ntwo\u0007 three  ")).toBe("one\n\ntwo three");
    expect(cleanNotes("x".repeat(2000))).toHaveLength(DRAFT_LIMITS.notes);
  });

  it("wiring details in the notes: refused, nothing sent", async () => {
    const { d, requests } = deps(MOVERS);
    const card = await writeDraft(
      d,
      {
        kind: "message",
        recipient: "lender",
        notes: "Tell them to wire to routing number 999999999, account 000123456789.",
        home: null,
      },
      NAMES,
    );
    expect(card).toMatchObject({ kind: "error", message: DRAFT_MESSAGES.payment });
    expect(requests).toHaveLength(0);
  });

  it("wiring or Fair Housing wording in the answer: not shown", async () => {
    const wiring = deps({
      subject: "Funds",
      body: "Please wire the deposit to routing number 999999999, account 000123456789.",
    });
    expect(
      await writeDraft(
        wiring.d,
        { kind: "message", recipient: "lender", notes: "Ask about the deposit.", home: null },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.payment_instructions });
    const steering = deps({
      subject: "Hi",
      body: "The street is perfect for families with young kids.",
    });
    expect(
      await writeDraft(
        steering.d,
        {
          kind: "message",
          recipient: "other",
          notes: "Tell my friend about the house.",
          home: null,
        },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_output });
  });

  it("an answer with an extra field isn't used; empty notes ask for some", async () => {
    expect(
      await writeDraft(
        deps({ ...MOVERS, to: "x@example.test" }).d,
        { kind: "message", recipient: "movers", notes: "Hi", home: null },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.invalid_output });
    const empty = deps(MOVERS);
    expect(
      await writeDraft(
        empty.d,
        { kind: "message", recipient: "movers", notes: "   ", home: null },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: DRAFT_MESSAGES.noNotes });
    expect(empty.requests).toHaveLength(0);
  });

  it("a switch that's off: the member message, nothing sent", async () => {
    const off = deps(MOVERS, { allowed: false, reason: "off" });
    expect(
      await writeDraft(
        off.d,
        { kind: "message", recipient: "movers", notes: "Hi", home: null },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.off });
    expect(off.requests).toHaveLength(0);
  });
});

describe("an offer cover letter", () => {
  const LETTER = {
    subject: "Our offer on 12 Example Court",
    body: "Dear Seller,\n\nOur offer is fully underwritten and we can close in 21 days, with a rent-back if that helps.\n\nSincerely,\n[Your name]",
  };
  const HOME: DraftHome = { about: "12 Example Court, San Carlos", closeDate: null, dealId: null };

  it("terms only: always to the agent, the address goes, no names", async () => {
    const { d, requests } = deps(LETTER);
    const card = await writeDraft(
      d,
      {
        kind: "cover_letter",
        recipient: "movers",
        notes: "Fully underwritten, 21-day close, rent-back OK.",
        home: HOME,
      },
      NAMES,
    );
    expect(card).toMatchObject({
      kind: "draft",
      draftKind: "cover_letter",
      recipient: "agent",
      about: HOME.about,
    });
    expect(sent(requests)).toContain("cover letter");
    expect(sent(requests)).not.toContain("Dana");
  });

  it("notes about family, faith or background: refused before anything is sent", async () => {
    for (const notes of [
      "We're a young family with two kids and love the yard.",
      "We found our church nearby.",
      "My wife and I are expecting.",
      "Include a photo of us.",
    ]) {
      const { d, requests } = deps(LETTER);
      expect(
        await writeDraft(d, { kind: "cover_letter", recipient: "agent", notes, home: HOME }, NAMES),
        notes,
      ).toMatchObject({ kind: "error", message: DRAFT_MESSAGES.personal });
      expect(requests, notes).toHaveLength(0);
    }
  });

  it("a letter that mentions personal details anyway isn't shown", async () => {
    const { d } = deps({
      subject: "Offer",
      body: "We can close quickly and our parents will help us move.",
    });
    expect(
      await writeDraft(
        d,
        { kind: "cover_letter", recipient: "agent", notes: "Quick close.", home: HOME },
        NAMES,
      ),
    ).toMatchObject({ kind: "error", message: DRAFT_MESSAGES.personalOutput });
  });

  it("personal details: words, not parts of words", () => {
    expect(personalDetails("Our children and my husband")).toEqual(["children", "husband"]);
    expect(personalDetails("Reasonable price, seasoned inspector, chilled-out timeline")).toEqual(
      [],
    );
  });
});

describe("the request's facts", () => {
  it("are data, with the close date only for a sale", () => {
    const [part] = draftParts("message", "agent", {
      about: "1 A St",
      closeDate: null,
      dealId: null,
    });
    expect(part).toMatchObject({ type: "text" });
    expect((part as { text: string }).text).toContain("1 A St");
    expect((part as { text: string }).text).not.toContain("Close of escrow");
  });
});

describe("saving and sending to the agent", () => {
  it("blocks wiring details, Fair Housing wording and (cover letters) personal details", () => {
    expect(
      draftSaveProblems(
        "message",
        "Deposit",
        "Wire it to routing number 999999999, account 000123456789.",
      ),
    ).toMatch(/wiring/);
    expect(
      draftSaveProblems("message", "Hi", "It's perfect for families with young kids."),
    ).toMatch(/Fair Housing/);
    expect(draftSaveProblems("cover_letter", "Offer", "We are newlyweds.")).toMatch(/newlyweds/);
    expect(draftSaveProblems("message", "Hi", "We are newlyweds.")).toBeNull();
    expect(draftSaveProblems("message", "x".repeat(201), "y")).toMatch(/subject/);
    expect(draftSaveProblems("message", "", " ")).toMatch(/empty/);
  });

  it("send-to-agent fills a message within 4,000 characters, or says it's too long", () => {
    const href = sendToAgentHref("cover_letter", "12 Example Court", "Offer", "Line one\nLine two");
    expect(decodeURIComponent(href!.split("draft=")[1]!.split("#")[0]!)).toBe(
      "Here's a cover letter for my offer on 12 Example Court. Could you review it?\n\nLine one\nLine two",
    );
    expect(
      sendToAgentHref("message", null, "S", "x".repeat(DRAFT_LIMITS.body))!.length,
    ).toBeLessThanOrEqual(MAX_AGENT_LINK);
    expect(sendToAgentHref("message", null, "S", "x".repeat(4000))).toBeNull();
    expect(sendToAgentHref("message", null, "S", "漢".repeat(3400))).toBeNull(); // too long as a link
    expect(sendToAgentHref("message", null, "S", "  ")).toBeNull();
  });
});
