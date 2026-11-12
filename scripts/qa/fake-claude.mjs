// Local QA only: stands in for the Claude API so the assistant can be checked
// end to end without a key, a cost, or any document leaving the machine.
// Start it, then start apps/va with ANTHROPIC_BASE_URL=http://127.0.0.1:4020
// and ANTHROPIC_API_KEY set to any value.
//
//   node scripts/qa/fake-claude.mjs <log file>
//
// It answers POST /v1/messages as a stream, the way the real API does. The
// answer is picked by a marker inside the PDF it's sent ("QA-MODE: ok", …);
// every value in it is fictional. The log gets one JSON line per request with
// the request's shape only (never its content), so a script can check what
// the console sent: a document, a JSON schema, no tools, no file uploads.

import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const LOG = process.argv[2];
if (!LOG) throw new Error("usage: node fake-claude.mjs <log file>");
writeFileSync(LOG, "");
const PORT = Number(process.env.FAKE_CLAUDE_PORT ?? 4020);

const src = (value, page = 1, quote = null) => ({ value, page, quote });
const cont = (days, waived = false, page = 2) => ({ days, waived, page: days === null && !waived ? null : page, quote: waived ? "Offer is NOT contingent" : days === null ? null : `${days} (or __) Days After Acceptance` });
const reading = (over = {}) => ({
  property_address: src("12 Fictional Lane, San Carlos, CA", 1, "Property: 12 Fictional Lane, San Carlos"),
  seller_names: src("Dana Example, Trustee of the Example Family Trust", 14, "Seller: Dana Example, Trustee of the Example Family Trust"),
  seller_type: src("trust", 14, "Trustee of the Example Family Trust"),
  acceptance_date: src("2026-03-02", 16, "Counter Offer No. 1 accepted: March 2, 2026"),
  days_to_close: src(30, 1, "Close Of Escrow shall occur 30 Days After Acceptance"),
  close_of_escrow_date: src(null, null, null),
  purchase_price: src(2150000, 16, "Purchase price shall be $2,150,000"),
  seller_rent_back_days: src(3, 3, "Seller to remain in possession for 3 Days After Close Of Escrow"),
  contingencies: { loan: cont(21), appraisal: cont(17), investigation: cont(10), insurance: cont(null) },
  notes: ["Counter Offer No. 1 changed the price from $2,100,000 to $2,150,000 (page 16).", "Buyer's initials are missing at the bottom of page 6."],
  ...over,
});

const ANSWERS = {
  ok: () => ({ text: JSON.stringify(reading()) }),
  cash: () => ({ text: JSON.stringify(reading({ contingencies: { loan: cont(null, true), appraisal: cont(null, true), investigation: cont(7), insurance: cont(null) }, notes: ["All-cash offer: no loan or appraisal contingency (page 2)."] })) }),
  // An answer carrying payment details: the console must refuse to show it.
  wiring: () => ({ text: JSON.stringify(reading({ notes: ["Wire the deposit to routing number 021000021, account 000123456789."] })) }),
  // Valid JSON that isn't the shape asked for.
  invalid: () => ({ text: JSON.stringify({ hello: "world" }) }),
  refusal: () => ({ text: "", stop: "refusal" }),
};

const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const url = new URL(req.url, "http://x");
  if (req.method !== "POST" || url.pathname !== "/v1/messages") {
    // Anything else (the Files API, batches, …) is something the console must never call.
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), unexpected: `${req.method} ${url.pathname}` })}\n`);
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not in the QA fake" } }));
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const blocks = (body.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
  const docs = blocks.filter((b) => b.type === "document");
  const pdf = docs[0]?.source?.type === "base64" ? Buffer.from(docs[0].source.data, "base64") : Buffer.alloc(0);
  const mode = /QA-MODE: ([a-z]+)/.exec(pdf.toString("latin1"))?.[1] ?? "ok";
  const system = (Array.isArray(body.system) ? body.system.map((s) => s.text).join("\n") : String(body.system ?? ""));
  appendFileSync(
    LOG,
    `${JSON.stringify({
      at: new Date().toISOString(),
      mode,
      model: body.model,
      fallbacks: (body.fallbacks ?? []).map((f) => f.model),
      beta: req.headers["anthropic-beta"] ?? null,
      stream: body.stream === true,
      messages: (body.messages ?? []).length,
      documents: docs.length,
      documentIsInlinePdf: docs.every((d) => d.source?.type === "base64" && d.source?.media_type === "application/pdf") && pdf.subarray(0, 5).toString() === "%PDF-",
      documentBytes: pdf.length,
      fileReferences: blocks.filter((b) => b.source?.type === "file").length,
      tools: (body.tools ?? []).length,
      format: body.output_config?.format?.type ?? null,
      effort: body.output_config?.effort ?? null,
      thinking: body.thinking?.type ?? null,
      systemHasFeatureRules: /transaction coordinator/.test(system),
      systemHasAlwaysRules: /wiring|Fair Housing/i.test(system),
      hasKey: Boolean(req.headers["x-api-key"]),
    })}\n`,
  );

  const answer = (ANSWERS[mode] ?? ANSWERS.ok)();
  const usage = { input_tokens: 61000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  send(res, "message_start", { message: { id: "msg_qa_local", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
  send(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < answer.text.length; i += 400) send(res, "content_block_delta", { index: 0, delta: { type: "text_delta", text: answer.text.slice(i, i + 400) } });
  send(res, "content_block_stop", { index: 0 });
  send(res, "message_delta", { delta: { stop_reason: answer.stop ?? "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
  send(res, "message_stop", {});
  res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`fake Claude on http://127.0.0.1:${PORT}, logging to ${LOG}`));
