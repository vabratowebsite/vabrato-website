import { beforeEach, describe, expect, it, vi } from "vitest";

// S6b PR 8: call notes, to-dos and appointments, as server actions against a
// small in-memory stand-in for Supabase (RLS itself is tested in
// packages/db: a lead or deal the caller can't see simply isn't returned).
// The model is a fake that records what it was asked. Fictional people.

const LEAD = "a1000000-0000-4000-8000-0000000035a1";
const DEAL = "d1000000-0000-4000-8000-0000000035d1";
const NOT_MINE = "d9000000-0000-4000-8000-0000000035d9";
const ME = "c1000000-0000-4000-8000-0000000035c1";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const asked: { feature: string; deal: string | null }[] = [];
let answer: unknown = null;
let n = 0;

function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" } | { kind: "update"; values: Row } | { kind: "insert"; rows: Row[] } = { kind: "select" };
  const run = () => {
    if (op.kind === "insert") {
      const rows = op.rows.map((r) => ({ id: `e9000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, status: "draft", sent_via: null, vendor_id: null, ...r }));
      (db[name] ??= []).push(...rows);
      return { data: rows, error: null };
    }
    const hit = (db[name] ?? []).filter((r) => filters.every((f) => f(r)));
    if (op.kind === "update") for (const r of hit) Object.assign(r, op.values);
    return { data: hit, error: null };
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    order: () => q,
    limit: () => q,
    update: (values: Row) => ((op = { kind: "update", values }), q),
    insert: (rows: Row | Row[]) => ((op = { kind: "insert", rows: Array.isArray(rows) ? rows : [rows] }), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    single: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: async () => ({ from: table, rpc: async () => ({ error: null }) }) }));
vi.mock("@vabrato/lib", async (orig) => ({ ...(await orig<typeof import("@vabrato/lib")>()), getProfile: async () => ({ id: ME, role: "agent", full_name: "Avery Example" }) }));
vi.mock("@/lib/ai", () => ({
  aiKeyConfigured: () => true,
  aiDeps: () => ({
    store: {
      begin: async (feature: string, deal: string | null) => {
        asked.push({ feature, deal: deal ?? null });
        return { allowed: true, run_id: "run-1" };
      },
      finish: async () => undefined,
    },
    model: { generate: async () => ({ text: JSON.stringify(answer), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } }) },
    log: () => undefined,
  }),
}));

const { readCallNotesAction, addTodosAction, startAppointmentAction, approveAppointmentAction } = await import("./call-actions");
const { approveDraftAction } = await import("./draft-actions");
const { pacificToday, addDaysISO, whenText } = await import("./appointment-kinds");

const CALL = { todos: [{ title: "Send the HOA documents", due_in_days: 1 }], followup: { subject: "Thanks for the call", body: "Hi Dana,\n\nThanks for the call.\n\nAvery" } };

beforeEach(() => {
  asked.length = 0;
  answer = null;
  db.leads = [{ id: LEAD, kind: "contact", name: "Jordan Example", listing_key: null }];
  db.deals = [{ id: DEAL, address: "1 Fixture Way, Belmont", ratification_date: "2026-10-01", days_to_close: 30, seller_name: "Dana Example" }];
  db.deal_members = [];
  db.ai_drafts = [];
  db.lead_notes = [];
  db.staff_todos = [];
});

describe("call notes", () => {
  it("a lead or deal the caller can't see is refused, and nothing is sent", async () => {
    answer = CALL;
    expect(await readCallNotesAction({ kind: "deal", id: NOT_MINE }, "Dana called about the HOA docs", false)).toEqual({ ok: false, error: "That isn't a lead or transaction you work on." });
    expect(asked).toEqual([]);
    expect(db.ai_drafts).toEqual([]);
  });

  it("on a deal: to-dos come back unsaved, the follow-up is saved as a draft, the notes aren't kept", async () => {
    answer = CALL;
    const r = await readCallNotesAction({ kind: "deal", id: DEAL }, "Dana called about the HOA docs", true);
    expect(asked).toEqual([{ feature: "staff_call_notes", deal: DEAL }]);
    expect(r).toMatchObject({ ok: true, todos: [{ title: "Send the HOA documents", due: addDaysISO(pacificToday(), 1) }], noteSaved: false });
    expect(db.staff_todos).toEqual([]);
    expect(db.ai_drafts).toEqual([expect.objectContaining({ kind: "call_followup", deal_id: DEAL, subject: "Thanks for the call" })]);
    expect(db.lead_notes).toEqual([]);
  });

  it("on a lead: the notes are saved as a lead note only when ticked", async () => {
    answer = CALL;
    await readCallNotesAction({ kind: "lead", id: LEAD }, "Jordan wants a valuation next week", false);
    expect(db.lead_notes).toEqual([]);
    await readCallNotesAction({ kind: "lead", id: LEAD }, "Jordan wants a valuation next week", true);
    expect(db.lead_notes).toEqual([expect.objectContaining({ lead_id: LEAD, author_id: ME, body: "Jordan wants a valuation next week" })]);
    expect(asked.every((a) => a.deal === null)).toBe(true);
  });

  it("notes with access details are refused before anything is sent", async () => {
    answer = CALL;
    expect(await readCallNotesAction({ kind: "deal", id: DEAL }, "Lockbox code 4455 for the inspector", false)).toMatchObject({ ok: false, error: expect.stringMatching(/lockbox/i) });
    expect(asked).toEqual([]);
  });
});

describe("to-dos", () => {
  it("adds the ticked ones, cleaned, with impossible dates dropped; nothing ticked is refused", async () => {
    expect(await addTodosAction({ kind: "deal", id: DEAL }, [], "call_notes")).toEqual({ ok: false, error: "Tick at least one to-do." });
    const r = await addTodosAction({ kind: "deal", id: DEAL }, [{ title: "Call the stager at 650-555-0123", due: "2026-02-30" }, { title: "  ", due: "" }, { title: "Order the HOA docs", due: "2026-11-20" }], "call_notes");
    expect(r).toEqual({ ok: true, message: "Added 2 to-dos." });
    expect(db.staff_todos).toEqual([
      expect.objectContaining({ deal_id: DEAL, title: "Call the stager at [phone]", due_date: null, source: "call_notes", created_by: ME }),
      expect.objectContaining({ deal_id: DEAL, title: "Order the HOA docs", due_date: "2026-11-20" }),
    ]);
  });
});

describe("appointments", () => {
  const tuesday = () => {
    const today = pacificToday();
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDaysISO(today, ((2 - dow + 7) % 7) || 7);
  };
  const APPT = () => ({ title: "Final walkthrough", date: tuesday(), start: "15:00", minutes: 45, location: "1 Fixture Way, Belmont", with: "Dana", subject: "Walkthrough on [when]", body: "Hi Dana,\n\nConfirming our walkthrough on [when].\n\nAvery" });

  it("a deal the caller can't see is refused, and nothing is sent", async () => {
    answer = APPT();
    expect(await startAppointmentAction({ kind: "deal", id: NOT_MINE }, "walkthrough Tuesday 3pm")).toMatchObject({ ok: false });
    expect(asked).toEqual([]);
  });

  it("drafted from a sentence, saved with checked fields; a changed time blocks approval until the email says it", async () => {
    answer = APPT();
    const r = await startAppointmentAction({ kind: "deal", id: DEAL }, "walkthrough with Dana Tuesday 3pm, 45 min, at the house");
    expect(r).toMatchObject({ ok: true });
    expect(asked).toEqual([{ feature: "staff_appointments", deal: DEAL }]);
    const saved = db.ai_drafts![0]!;
    expect(saved).toMatchObject({ kind: "appointment", deal_id: DEAL, content: { date: tuesday(), start: "15:00", minutes: 45 } });
    expect(saved.body).toContain(whenText(tuesday(), "15:00"));

    const id = saved.id as string;
    const fields = { ...(saved.content as Record<string, unknown>), start: "16:00" } as never;
    const moved = await approveAppointmentAction(id, fields, { subject: saved.subject as string, body: saved.body as string });
    expect(moved).toMatchObject({ ok: false, error: expect.stringContaining(`"${whenText(tuesday(), "16:00")}"`) });
    expect(db.ai_drafts![0]!.status).toBe("draft");
    const fixed = (saved.body as string).replace(whenText(tuesday(), "15:00"), whenText(tuesday(), "16:00"));
    const ok = await approveAppointmentAction(id, fields, { subject: "Walkthrough", body: fixed });
    expect(ok).toMatchObject({ ok: true, appointment: { status: "approved" } });
  });

  it("the generic draft actions refuse appointments (they have their own checks)", async () => {
    db.ai_drafts = [{ id: "e9000000-0000-4000-8000-000000000999", kind: "appointment", status: "draft", subject: "x", body: "x", sent_via: null, vendor_id: null }];
    expect(await approveDraftAction("e9000000-0000-4000-8000-000000000999", { subject: "x", body: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/own page/) });
    expect(db.ai_drafts[0]!.status).toBe("draft");
  });
});
