import { describe, expect, it } from "vitest";
import type { AiDeps, AiStore, ModelClient, ModelRequest } from "@vabrato/ai";
import { textPdf } from "@vabrato/lib";
import { MEMBER_MESSAGES, summarizeDocument } from "./ask";
import type { SummaryAnswer } from "./features";
import { FILE_MESSAGES, MEMBER_PAGE_LIMIT, UNCOUNTED_PDF_MAX_BYTES, checkFileBytes, parseDocRef, type MemberFile } from "./files";
import { cleanLine, summaryView, validPages } from "./summary";

// Ask Vabrato's document summary (S5b PR 2) without the network: file checks,
// the answer's cleanup, and the pipeline with a fake model. Fictional files.

const UUID = "a2000000-0000-4000-8000-0000000037a1";
const pdf = (pages: number) => new Uint8Array(textPdf(Array.from({ length: pages }, (_, i) => [`Fictional page ${i + 1}`])));
const HEIC = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0, 0]);

const answer = (over: Partial<SummaryAnswer> = {}): SummaryAnswer => ({
  summary: [
    { text: "Three outlets lack GFCI protection.", pages: [2] },
    { text: "The water heater needs a second strap.", pages: [4] },
  ],
  questions: [{ text: "Will the seller fix the outlets?", pages: [2] }],
  todos: [
    { title: "Get a quote for the GFCI outlets", page: 2 },
    { title: "Get a quote for the GFCI outlets!", page: 2 },
  ],
  kind: "home inspection report",
  ...over,
});

function deps(reply: unknown, gate: Awaited<ReturnType<AiStore["begin"]>> = { allowed: true, run_id: "run-1" }) {
  const requests: ModelRequest[] = [];
  const began: (string | null)[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(reply), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 9000, outputTokens: 700, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const store: AiStore = { begin: async (_f, deal) => (began.push(deal ?? null), gate), finish: async () => undefined };
  return { d: { store, model, log: () => undefined } as AiDeps, requests, began };
}

const file = (over: Partial<MemberFile> = {}): MemberFile => {
  const r = checkFileBytes(pdf(4), "Inspection report.pdf", null);
  if (!r.ok) throw new Error(r.error);
  return { ...r.file, ...over };
};

describe("which document", () => {
  it("reads 'upload:<id>' and 'deal:<path>', nothing else", () => {
    expect(parseDocRef(`upload:${UUID}`)).toEqual({ kind: "upload", id: UUID });
    expect(parseDocRef(`deal:deal/${UUID}/Disclosures.pdf`)).toEqual({ kind: "deal", path: `deal/${UUID}/Disclosures.pdf`, dealId: UUID });
    for (const bad of ["", "upload:1", `deal:deal/${UUID}/staff/x.pdf`, `deal:deal/${UUID}/../x.pdf`, `member:${UUID}`, `upload:${UUID}' or 1=1`]) expect(parseDocRef(bad), bad).toBeNull();
  });
});

describe("file checks (before anything is sent)", () => {
  it("a PDF within 50 pages becomes a PDF part with its page count", () => {
    const r = checkFileBytes(pdf(4), "Inspection report.pdf", null);
    expect(r).toMatchObject({ ok: true, file: { name: "Inspection report.pdf", pages: 4, dealId: null, part: { type: "pdf", title: "Inspection report.pdf" } } });
  });

  it("51 pages is refused with the page count", () => {
    expect(checkFileBytes(pdf(MEMBER_PAGE_LIMIT + 1), "HOA packet.pdf", null)).toEqual({ ok: false, error: FILE_MESSAGES.tooLong(51) });
  });

  it("iPhone photos (HEIC) get a clear message", () => {
    expect(checkFileBytes(HEIC, "photo.heic", null)).toEqual({ ok: false, error: FILE_MESSAGES.heic });
  });

  it("files over 20 MB, and files that aren't documents, are refused", () => {
    expect(checkFileBytes(new Uint8Array(21 * 1024 * 1024), "big.pdf", null)).toEqual({ ok: false, error: FILE_MESSAGES.tooBig });
    expect(checkFileBytes(new Uint8Array(Buffer.from("<svg>not a document</svg>")), "x.svg", null)).toEqual({ ok: false, error: FILE_MESSAGES.unreadable });
  });

  it("a PDF whose pages can't be counted is read only if it's small", () => {
    const small = new Uint8Array(Buffer.from("%PDF-1.5\n1 0 obj << /Type /ObjStm /N 40 >> stream x endstream"));
    expect(checkFileBytes(small, "scan.pdf", null)).toMatchObject({ ok: true, file: { pages: null } });
    const big = new Uint8Array(UNCOUNTED_PDF_MAX_BYTES + 10);
    big.set(Buffer.from("%PDF-1.5\n"));
    expect(checkFileBytes(big, "scan.pdf", null)).toEqual({ ok: false, error: FILE_MESSAGES.uncounted });
  });

  it("an image is one page", () => {
    expect(checkFileBytes(PNG, "receipt.png", null)).toMatchObject({ ok: true, file: { pages: 1, part: { type: "image", mediaType: "image/png" } } });
  });
});

describe("the answer, cleaned", () => {
  it("page references only within the file", () => {
    expect(validPages([0, 2, 2, 4, 5, 999], 4)).toEqual([2, 4]);
    expect(validPages([10, 51], null)).toEqual([10]);
  });

  it("no emails, phone numbers or links; repeated to-dos dropped", () => {
    expect(cleanLine("Call Bay Plumbing at 650-555-0142 or plumber@example.test, see https://x.example", 200)).toBe("Call Bay Plumbing at or, see");
    const v = summaryView(answer({ todos: [{ title: "Call 650-555-0142 about the heater", page: 9 }, { title: "Get a quote", page: 2 }, { title: "get a QUOTE.", page: 3 }] }), 4);
    expect(v.todos).toEqual([
      { title: "Call about the heater", page: null },
      { title: "Get a quote", page: 2 },
    ]);
  });

  it("at most 8 points, 6 questions and 8 to-dos", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Point ${i}`, pages: [1] }));
    const v = summaryView(answer({ summary: many(20), questions: many(20), todos: Array.from({ length: 20 }, (_, i) => ({ title: `To-do ${i}`, page: 1 })) }), 4);
    expect([v.points.length, v.questions.length, v.todos.length]).toEqual([8, 6, 8]);
  });
});

describe("summarize a document", () => {
  it("sends the document (as a PDF part) and a line naming it; returns the cleaned card", async () => {
    const { d, requests } = deps(answer());
    const card = await summarizeDocument(d, file());
    expect(card).toMatchObject({ kind: "summary", question: "Summarize: Inspection report.pdf", docName: "Inspection report.pdf", pages: 4, docKind: "home inspection report" });
    expect((card as { todos: unknown[] }).todos).toHaveLength(1);
    expect(JSON.stringify(requests[0]!.parts.map((p) => p.type))).toBe('["text","pdf"]');
  });

  it("a shared deal file is run against its deal (ai_begin checks the member's access)", async () => {
    const { d, began } = deps(answer());
    await summarizeDocument(d, file({ dealId: UUID }));
    expect(began).toEqual([UUID]);
  });

  it("wiring details or Fair Housing wording in the summary: not shown", async () => {
    const wiring = deps(answer({ summary: [{ text: "Wire the deposit to routing number 999999999, account 000123456789.", pages: [3] }] }));
    expect(await summarizeDocument(wiring.d, file())).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.payment_instructions });
    const steering = deps(answer({ summary: [{ text: "Perfect for families with young kids.", pages: [1] }] }));
    expect(await summarizeDocument(steering.d, file())).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_output });
  });

  it("an empty summary, a switch that's off, a daily limit: member messages", async () => {
    expect(await summarizeDocument(deps(answer({ summary: [] })).d, file())).toMatchObject({ kind: "error", message: expect.stringMatching(/couldn't find anything/) });
    const off = deps(answer(), { allowed: false, reason: "off" });
    expect(await summarizeDocument(off.d, file())).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.off });
    expect(off.requests).toHaveLength(0);
  });

  it("an answer with an extra field isn't used", async () => {
    expect(await summarizeDocument(deps({ ...answer(), advice: "buy it" }).d, file())).toMatchObject({ kind: "error", message: expect.stringMatching(/didn't come through/) });
  });
});
