import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anthropicClient, paymentInstructionMatches, runAi, type ModelClient, type ModelResult } from "@vabrato/ai";
import { prepareNote } from "../lib/drafts";
import { budgetStore, worstCase } from "./budget";
import { ACCESS_DETAIL_NOTE, CANARY, LIVE_CALLS, NO_MODEL_CHECKS, type Mode } from "./registry";

// The live test (S6b PR 9): every AI feature once against the real Claude
// API, with fictional input, through the same runAi() pipeline the console
// uses. Never in CI. Two modes:
//   LIVE_AI_FAKE=1  the local fake (scripts/qa/fake-claude.mjs on :4020); no cost.
//   LIVE_AI=1       the real API; needs ANTHROPIC_API_KEY in this process's
//                   environment (a dedicated, spend-limited key; see STATUS).
// LIVE_AI_BUDGET_USD caps the spend (default 5); LIVE_AI_ONLY=<id,...> re-runs
// some calls. The committed report (docs/qa/s6b-live-run.json, live mode
// only) holds metadata only; answers go to the gitignored apps/va/.live-ai/.

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, "../..");
const LOCAL = join(APP, ".live-ai");
const LIVE_REPORT = resolve(APP, "../../docs/qa/s6b-live-run.json");
const PLACEHOLDER_KEY = "placeholder-not-a-real-key";

const mode: Mode | null = process.env.CI ? null : process.env.LIVE_AI_FAKE === "1" ? "fake" : process.env.LIVE_AI === "1" ? "live" : null;
if (mode === "live" && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === PLACEHOLDER_KEY)) throw new Error("LIVE_AI=1 needs ANTHROPIC_API_KEY in this process's environment.");
// The target is always set here, never inherited: a shell may already carry an
// ANTHROPIC_BASE_URL for something else, and the live run must reach Anthropic's API.
if (mode === "fake") {
  process.env.ANTHROPIC_BASE_URL = process.env.LIVE_AI_FAKE_URL || "http://127.0.0.1:4020";
  process.env.ANTHROPIC_API_KEY = PLACEHOLDER_KEY;
}
if (mode === "live") process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
delete process.env.ANTHROPIC_AUTH_TOKEN;
// The fake server reports a fixed 61,000 input tokens per call, so fake-mode
// spend isn't real; its cap defaults high (the tiny-cap test covers the gate).
const CAP = Number(process.env.LIVE_AI_BUDGET_USD ?? (mode === "fake" ? "1000" : "5"));
const ONLY = (process.env.LIVE_AI_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

type Outcome = "ok" | "fail" | "not_run";
interface Row {
  id: string;
  feature: string;
  outcome: Outcome;
  reason: string | null;
  checks: { name: string; ok: boolean }[];
  findings: { name: string; ok: boolean }[];
  attempts: { model: string; inputTokens: number; outputTokens: number }[];
  costUsd: number;
  seconds: number;
  worstCaseUsd: number;
}

/** The real client with no retries, wrapped so the test sees every raw answer (blocked ones too). */
function recordingModel() {
  const inner = anthropicClient({ maxRetries: 0 });
  const raw: { call: string; text: string; result: Omit<ModelResult, "text"> }[] = [];
  let current = "";
  const model: ModelClient = {
    async generate(req) {
      const r = await inner.generate(req);
      const { text, ...rest } = r;
      raw.push({ call: current, text, result: rest });
      return r;
    },
  };
  return { model, raw, setCall: (id: string) => void (current = id) };
}

const CONTACT = /[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i;
/** Errors reach the report as a reason only: no messages, keys or long numbers (the repo is public). */
const sanitize = (s: string) => s.replace(/sk-ant-[\w-]+/g, "[key]").replace(/\d{8,}/g, "[number]").slice(0, 80);

describe.runIf(mode)(`live AI test (${mode ?? "off"})`, () => {
  it("runs every feature once, within the cap, with no injection obeyed", async () => {
    const calls = ONLY.length ? LIVE_CALLS.filter((c) => ONLY.includes(c.id)) : LIVE_CALLS;
    if (ONLY.length) expect(calls.map((c) => c.id).sort()).toEqual([...ONLY].sort());
    const { model, raw, setCall } = recordingModel();
    const budget = budgetStore(CAP);
    const deps = { store: budget.store, model, log: () => undefined };
    const rows: Row[] = [];
    const hardFails: string[] = [];

    // Refusals that must happen before anything is sent.
    for (const c of NO_MODEL_CHECKS) {
      budget.expect({ inputTokens: 0, outputTokens: 0, usd: 0 });
      const before = raw.length;
      const r = await runAi(deps, c.feature, { instruction: c.instruction, parts: [{ type: "text", text: "Today is a fictional day." }] });
      const ok = !r.ok && r.reason === c.expect && raw.length === before;
      if (!ok) hardFails.push(`${c.id}: expected ${c.expect} with no model call`);
    }
    if (!prepareNote(ACCESS_DETAIL_NOTE).error) hardFails.push("access details: the note wasn't refused");

    // The calls, strictly in order.
    for (const c of calls) {
      const input = c.input(mode as Mode);
      const worst = worstCase(c.feature, input);
      budget.expect(worst);
      setCall(c.id);
      const spentBefore = budget.spentUsd();
      const rawBefore = raw.length;
      const started = Date.now();
      const r = await runAi(deps, c.feature, input);
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      const mine = raw.slice(rawBefore);
      const attempts = mine.flatMap((m) => (m.result.attempts ?? [{ model: m.result.model, usage: m.result.usage }]).map((a) => ({ model: a.model, inputTokens: a.usage.inputTokens + a.usage.cacheWriteTokens, outputTokens: a.usage.outputTokens })));
      const row: Row = { id: c.id, feature: c.feature.key, outcome: "ok", reason: null, checks: [], findings: [], attempts, costUsd: Math.round((budget.spentUsd() - spentBefore) * 1e6) / 1e6, seconds, worstCaseUsd: Math.round(worst.usd * 1e4) / 1e4 };

      if (!r.ok && r.reason === "monthly_budget" && mine.length === 0) {
        row.outcome = "not_run";
        row.reason = "budget cap";
      } else if (!r.ok) {
        row.outcome = "fail";
        row.reason = sanitize(r.reason);
        hardFails.push(`${c.id}: ${r.reason}`);
        if (c.injection && r.reason === "payment_instructions") hardFails.push(`${c.id}: the injection was obeyed (payment details written)`);
      } else {
        const shown = c.shown(r.data, r.text);
        const shownText = JSON.stringify(shown);
        row.checks.push({ name: "no payment or wiring details shown", ok: paymentInstructionMatches(shown).length === 0 });
        row.checks.push({ name: "no contact details shown", ok: !CONTACT.test(shownText) });
        for (const x of row.checks) if (!x.ok) hardFails.push(`${c.id}: ${x.name}`);
        try {
          row.findings = c.findings(r.data);
        } catch {
          row.findings = [{ name: "the answer could be processed", ok: false }];
        }
      }
      if (mine.some((m) => m.text.includes(CANARY))) {
        row.checks.push({ name: "injection canary absent", ok: false });
        hardFails.push(`${c.id}: the injection canary appeared in the model's answer`);
      } else row.checks.push({ name: "injection canary absent", ok: true });
      // A call that cost more than its worst case means the estimate is wrong: the cap can't be trusted.
      if (mode === "live" && row.costUsd > worst.usd) hardFails.push(`${c.id}: cost over its worst-case estimate`);
      rows.push(row);
    }

    // Fake mode reports a fallback on the call-notes call: both attempts must be counted.
    const notes = rows.find((r) => r.id === "call_notes");
    if (mode === "fake" && notes && (notes.attempts.length !== 2 || notes.costUsd < (61000 * 4 + 300 * 20 + 61000 * 5 + 900 * 25) / 1e6 - 1e-6)) hardFails.push("call_notes: the fallback's two attempts weren't both counted");

    const spent = budget.spentUsd();
    if (spent > CAP) hardFails.push(`spent $${spent.toFixed(4)} over the $${CAP} cap`);
    if (!ONLY.length) {
      const ran = new Set(rows.map((r) => r.id));
      for (const c of LIVE_CALLS) if (!ran.has(c.id)) hardFails.push(`${c.id}: missing from the run`);
    }

    // Reports: metadata only in the committed file; answers stay local.
    mkdirSync(LOCAL, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(LOCAL, `answers-${mode}-${stamp}.json`), JSON.stringify(raw, null, 2));
    const report = {
      mode,
      at: new Date().toISOString(),
      capUsd: CAP,
      spentUsd: Math.round(spent * 1e6) / 1e6,
      only: ONLY.length ? ONLY : null,
      fallbackUsed: rows.some((r) => r.attempts.length > 1),
      hardFails: hardFails.map(sanitize),
      summary: { ok: rows.filter((r) => r.outcome === "ok").length, fail: rows.filter((r) => r.outcome === "fail").length, notRun: rows.filter((r) => r.outcome === "not_run").length, findingsMissed: rows.flatMap((r) => r.findings.filter((f) => !f.ok).map((f) => `${r.id}: ${f.name}`)) },
      calls: rows,
    };
    if (mode === "live" && !ONLY.length) {
      mkdirSync(dirname(LIVE_REPORT), { recursive: true });
      writeFileSync(LIVE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
    } else writeFileSync(join(LOCAL, `report-${mode}${ONLY.length ? "-partial" : ""}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.info(`[live-ai] ${mode}: ${report.summary.ok} ok, ${report.summary.fail} failed, ${report.summary.notRun} not run; spent $${report.spentUsd} of $${CAP}`);
    if (report.summary.findingsMissed.length) console.info(`[live-ai] findings to look at:\n  ${report.summary.findingsMissed.join("\n  ")}`);

    expect(hardFails).toEqual([]);
  });

  it.runIf(mode === "fake")("fake only: a tiny cap stops every call before anything is sent", async () => {
    const { model, raw } = recordingModel();
    const budget = budgetStore(0.01);
    let notRun = 0;
    for (const c of LIVE_CALLS) {
      const input = c.input("fake");
      budget.expect(worstCase(c.feature, input));
      const r = await runAi({ store: budget.store, model, log: () => undefined }, c.feature, input);
      if (!r.ok && r.reason === "monthly_budget") notRun++;
    }
    expect(notRun).toBe(LIVE_CALLS.length);
    expect(raw).toEqual([]);
  });
});
