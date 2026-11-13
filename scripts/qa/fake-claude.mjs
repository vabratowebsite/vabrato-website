// Local QA only: stands in for the Claude API so the assistant can be checked
// end to end without a key, a cost, or any document leaving the machine.
// Start it, then start apps/va with ANTHROPIC_BASE_URL=http://127.0.0.1:4020
// and ANTHROPIC_API_KEY set to any value.
//
//   node scripts/qa/fake-claude.mjs <log file>
//
// It answers POST /v1/messages as a stream, the way the real API does. The
// contract reader's answer is picked by a marker inside the PDF it's sent
// ("QA-MODE: ok", …), a draft's by the same marker in the request text; every
// value in it is fictional. The log gets one JSON line per request with
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

// AI drafts (S6b PR 3): the feature is told apart by its instructions; the
// mode by a "QA-MODE: …" marker in the request text (a lead's message, a
// task title or the person's note).
const DRAFT_FEATURES = [
  ["lead_reply", /first reply to someone who contacted/],
  ["open_house_followup", /signed in at one of Vabrato's open houses/],
  ["escrow_update", /update for the seller on their sale/],
  ["vendor_request", /request to a vendor/],
];
const draftFeature = (system) => DRAFT_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;

// S6b PR 4: the briefing, member summary and questions. Answers cite refs the
// request actually carried, plus one made-up ref (T999) the console must not
// link. The feature is told apart by its instructions.
const SUMMARY_FEATURES = [
  ["daily_briefing", /Write this person's briefing/],
  ["member_summary", /Summarize one member's recent activity/],
  ["data_questions", /Answer the person's question about their own work/],
];
const summaryFeature = (system) => SUMMARY_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;

// S6b PR 5: launch kits and presentations.
const KIT_FEATURES = [
  ["listing_kit", /Write a launch kit for one of Vabrato's own listings/],
  ["listing_presentation", /This is a listing presentation/],
  ["buyer_presentation", /This is a buyer presentation/],
];
const kitFeature = (system) => KIT_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;

// S6b PR 6: market updates and CMA write-ups. The answer uses the figures in
// the request's data block, so the console's numbers check passes; mode
// "invented" adds a figure that wasn't sent.
const STATS_FEATURES = [
  ["market_update", /Write a short market update for one city/],
  ["cma_writeup", /summary of a comparative market analysis/],
];
const statsFeature = (system) => STATS_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;
const dataJson = (texts) => {
  for (const m of texts.matchAll(/<data label="[^"]*">\n([\s\S]*?)\n<\/data>/g)) {
    try {
      return JSON.parse(m[1]);
    } catch {
      // not JSON
    }
  }
  return {};
};
const usd = (n) => "$" + Math.round(Number(n)).toLocaleString("en-US");
const STATS_ANSWER = (feature, data, mode) => {
  const extra = mode === "invented" ? " Prices will rise 15% next year." : "";
  if (feature === "market_update") {
    const sold = data.sold ?? {};
    const median = sold.median_price ? ", at a median price of " + usd(sold.median_price) : "";
    return {
      title: (data.city_name ?? "The city") + " market, last " + data.months + " months",
      excerpt: sold.count + " homes sold" + median + ".",
      body_md: "## What sold\n\n" + sold.count + " homes sold in " + data.city_name + " over the last " + data.months + " months" + median + "." + extra + "\n\n## For sale now\n\n" + (data.market?.active ?? 0) + " homes are for sale.\n\nFigures from MLSListings data for the period.",
    };
  }
  const r = data.range;
  return {
    summary: (r ? "The comparable sales put the range at " + usd(r.low) + " to " + usd(r.high) + "." : "There isn't enough information for a range.") + extra + " This is a comparison of recent sales, not an appraisal.",
    comparables: (data.comparables ?? []).slice(0, 3).map((c) => ({ key: c.key, note: "Similar size and age." })),
    adjustments_note: "Condition and updates matter more than the numbers show.",
  };
};
// S6b PR 7a: "Check this document" and the receipt reader. The file (a PDF
// or an image) carries the "QA-MODE: …" marker in its bytes.
const FILE_FEATURES = [
  ["document_check", /keep a sale's file complete/],
  ["receipt_reader", /You read a receipt or invoice/],
  ["inspection_items", /List the repair items the report raises/],
  ["counter_changes", /see what a counter offer or addendum changes/],
];
// S6b PR 7b: the response's opening and closing; the mode comes from the
// agent's note ("QA-MODE: invented" adds an amount, "words" spells one out).
const RESPONSE_FEATURE = /write the seller's response to the buyer's request for repairs/;
const REPAIR_ITEM = (n, over = {}) => ({ title: `Item ${n}`, detail: "Fictional finding.", location: "Garage", trade: "general", page: n, severity_label: "", severity: "maintenance", ...over });
const fileFeature = (system) => FILE_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;
const FILE_ANSWERS = {
  document_check: (mode) =>
    mode === "wiring"
      ? { doc_types: ["rpa"], title: "Purchase agreement", signed: "yes", issues: [{ page: 2, issue: "Wire the deposit to routing number 021000021, account 000123456789." }] }
      : mode === "none"
        ? { doc_types: [], title: "Lender pre-approval letter", signed: "not_applicable", issues: [] }
        : { doc_types: ["tds", "spq", "made_up_type"], title: "Seller disclosure packet", signed: "unclear", issues: [{ page: 3, issue: "Seller initials missing at the bottom of the page." }, { page: null, issue: "The SPQ looks like an older form version." }] },
  inspection_items: (mode) =>
    mode === "many"
      ? { items: Array.from({ length: 60 }, (_, i) => REPAIR_ITEM(i + 1)) }
      : mode === "wiring"
        ? { items: [REPAIR_ITEM(1, { detail: "Wire the repair deposit to routing number 021000021, account 000123456789." })] }
        : {
            items: [
              REPAIR_ITEM(1, { title: "Missing GFCI protection at kitchen counter outlets", detail: "Outlets within six feet of the sink aren't GFCI protected. Call 650-555-0123 for a quote.", location: "Kitchen", trade: "electrical", page: 12, severity_label: "Safety concern", severity: "safety" }),
              REPAIR_ITEM(2, { title: "Water heater lacks seismic strapping", detail: "Two straps are required; none are installed.", location: "Garage", trade: "water_heater", page: 18, severity_label: "Safety concern", severity: "safety" }),
              REPAIR_ITEM(3, { title: "Wood rot at rear deck stairs", detail: "Section 1 finding: damaged wood at the lower treads (about $900 to repair).", location: "Rear deck", trade: "pest", page: 3, severity_label: "Section 1", severity: "repair" }),
              REPAIR_ITEM(4, { title: "Debris in gutters", detail: "Clean gutters and downspouts.", location: "Roof", trade: "roofing", page: 22, severity_label: "Maintenance", severity: "maintenance" }),
            ],
          },
  // S6b PR 7c: the terms a counter offer sets (fictional). "unsigned" isn't signed by both sides.
  counter_changes: (mode) => {
    const none = { value: null, page: null, quote: null };
    const nc = { days: null, waived: false, page: null, quote: null };
    return {
      document_kind: "counter_offer",
      signed_by_both: mode === "unsigned" ? "no" : "yes",
      acceptance_date: none,
      days_to_close: none,
      close_of_escrow_date: none,
      purchase_price: { value: 2150000, page: 1, quote: "Purchase price shall be $2,150,000. Questions to buyer.agent@example.com" },
      seller_rent_back_days: { value: 3, page: 1, quote: "Seller to remain in possession for 3 Days After Close Of Escrow" },
      contingencies: {
        loan: { days: 21, waived: false, page: 1, quote: "Loan contingency removed within 21 Days After Acceptance" },
        appraisal: { days: null, waived: true, page: 2, quote: "Appraisal contingency is removed" },
        investigation: nc,
        insurance: nc,
      },
      other_changes: [{ page: 2, change: "Seller to leave the garage refrigerator." }, { page: 2, change: "Escrow holder changes to Fixture Escrow; call 650-555-0123." }],
    };
  },
  receipt_reader: (mode) =>
    mode === "unreadable"
      ? { readable: false, vendor: null, amount: null, date: null, category: null, problem: "The photo is too blurry to read the total." }
      : { readable: true, vendor: "Fixture Home Inspections", amount: 550, date: "2026-10-02", category: "Inspection", problem: null },
};
const KIT_ANSWER = {
  mls_description: "Light-filled three-bedroom home with a remodeled kitchen, a sunny yard and an easy walk to the park.",
  headline: "Light-filled in San Carlos",
  instagram: "Just listed in San Carlos: light, a remodeled kitchen and a sunny yard. #justlisted #sancarlos",
  facebook: "Just listed: a light-filled three-bedroom home with a remodeled kitchen and a sunny yard.",
  linkedin: "Proud to bring this light-filled San Carlos home to market.",
  email_subject: "Just listed in San Carlos",
  email_body: "Hi,\n\nI've just listed a light-filled three-bedroom home in San Carlos with a remodeled kitchen and a sunny yard.\n\nAvery",
  flyer_headline: "Light-filled in San Carlos",
  flyer_bullets: ["Remodeled kitchen", "Sunny yard", "Three bedrooms", "Walk to the park"],
  flyer_blurb: "A bright, updated home with room to relax inside and out.",
};
const PRESENTATION_ANSWER = (kind) => ({
  title: kind === "listing_presentation" ? "Selling your home with Vabrato" : "Buying a home with Vabrato",
  sections: [
    { heading: "Welcome", paragraphs: ["Thank you for meeting with me.", "Here's how we'd work together."] },
    { heading: kind === "listing_presentation" ? "Preparing and marketing your home" : "Finding the right home", paragraphs: ["We start with a plan that fits your timing."] },
    { heading: "Through escrow", paragraphs: ["Your portal shows every deadline and document."] },
  ],
});
const refsIn = (texts) => [...texts.matchAll(/^([DTCLM]\d+) \|/gm)].map((m) => m[1]);
const SUMMARY_ANSWERS = {
  daily_briefing: (refs) => ({
    headline: "A busy day: one overdue task and a lead waiting for a reply.",
    sections: [
      { title: "Needs you first", items: [...refs.filter((r) => r[0] === "T").slice(0, 1).map((ref) => ({ text: "Order the HOA documents: overdue.", ref })), ...refs.filter((r) => r[0] === "L").slice(0, 1).map((ref) => ({ text: "Jordan asked for a tour and hasn't had a reply (L1).", ref }))] },
      { title: "This week", items: [...refs.filter((r) => r[0] === "D").map((ref) => ({ text: `Closing coming up for transaction ${ref}.`, ref })), { text: "Something the assistant made up.", ref: "T999" }] },
    ],
  }),
  member_summary: () => ({ summary: "Jordan has been active this week: saved homes in San Carlos and asked for a Saturday tour.", looking_for: ["3 bedrooms in San Carlos", "Up to about $2,000,000"], next_steps: ["Confirm the Saturday tour.", "Send two similar homes."] }),
  data_questions: (refs, texts) =>
    /market/i.test(texts)
      ? { answer: "Your records here don't include market data. Try Market stats in the console.", refs: [], not_in_data: true }
      : { answer: `You have ${refs.filter((r) => r[0] === "D").length} active transaction(s) and ${refs.filter((r) => r[0] === "L").length} lead(s) in your records.`, refs: [...refs.filter((r) => r[0] === "D"), "X42"], not_in_data: false },
};
const DRAFT_TEXT = {
  lead_reply: { subject: "Re: 12 Fictional Lane", body: "Hi Jordan,\n\nThanks for asking about 12 Fictional Lane. It's still available, and Saturday morning works for a showing.\n\nWould [time] suit you?\n\nAvery" },
  open_house_followup: { subject: "Thanks for visiting 12 Fictional Lane", body: "Hi Riley,\n\nThank you for coming to the open house on Saturday. If you'd like a second look or the disclosures, just reply.\n\nAvery" },
  escrow_update: { subject: "Your sale: where things stand", body: "Hi Dana,\n\nA quick update on 12 Fictional Lane. Escrow is open, and the inspections are done. The loan contingency is due to be removed on March 23, and we're on track to close on April 1.\n\nVera" },
  vendor_request: { subject: "Quote request: 12 Fictional Lane, San Carlos", body: "Hi,\n\nCould you quote the section 1 items from the pest report at 12 Fictional Lane, San Carlos? The sale closes on April 1, so we'd need the work done before then.\n\nPlease send your availability and a written quote.\n\nVera" },
};
const DRAFT_ANSWERS = {
  ok: (f) => ({ text: JSON.stringify(DRAFT_TEXT[f]) }),
  wiring: (f) => ({ text: JSON.stringify({ ...DRAFT_TEXT[f], body: "Wire the deposit to routing number 021000021, account 000123456789." }) }),
  steering: (f) => ({ text: JSON.stringify({ ...DRAFT_TEXT[f], body: "This home is perfect for young families." }) }),
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
  const system = (Array.isArray(body.system) ? body.system.map((s) => s.text).join("\n") : String(body.system ?? ""));
  const texts = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const summary = summaryFeature(system);
  const kit = kitFeature(system);
  const stats = statsFeature(system);
  const fileFeat = fileFeature(system);
  const images = blocks.filter((b) => b.type === "image");
  const fileBytes = docs.length ? pdf : images[0]?.source?.type === "base64" ? Buffer.from(images[0].source.data, "base64") : Buffer.alloc(0);
  const feature = draftFeature(system) ?? summary ?? kit ?? stats ?? fileFeat ?? (RESPONSE_FEATURE.test(system) ? "repair_response" : null);
  const mode = /QA-MODE: ([a-z]+)/.exec(feature && !fileFeat ? texts : fileBytes.toString("latin1"))?.[1] ?? "ok";
  const refs = refsIn(texts);
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
      images: images.length,
      imageTypes: images.map((b) => b.source?.media_type ?? null),
      documentIsInlinePdf: docs.every((d) => d.source?.type === "base64" && d.source?.media_type === "application/pdf") && pdf.subarray(0, 5).toString() === "%PDF-",
      documentBytes: pdf.length,
      fileReferences: blocks.filter((b) => b.source?.type === "file").length,
      tools: (body.tools ?? []).length,
      format: body.output_config?.format?.type ?? null,
      effort: body.output_config?.effort ?? null,
      thinking: body.thinking?.type ?? null,
      systemHasFeatureRules: /transaction coordinator/.test(system),
      systemHasAlwaysRules: /wiring|Fair Housing/i.test(system),
      // SDK 1.x sends the key as "Authorization: Bearer"; older ones used x-api-key.
      hasKey: Boolean(req.headers["x-api-key"] || /^Bearer ./.test(req.headers.authorization ?? "")),
      feature: feature ?? "staff_contract_reader",
      dataBlocks: (texts.match(/<data label="/g) ?? []).length,
      // Contact and access details must never reach the model (checked on the request text, not logged).
      requestHasEmail: /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i.test(texts),
      requestHasPhone: /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(texts),
      requestHasLockbox: /lockbox|lock box|gate code/i.test(texts),
      // A price (2,150,000 or 2150000) or the QA escrow number (it holds a 13-digit timestamp).
      requestHasLongNumber: /\d{1,3}(?:,\d{3}){2,}|\b\d{6,}\b/.test(texts),
      refsSent: Object.fromEntries(["D", "T", "C", "L", "M"].map((k) => [k, refs.filter((r) => r[0] === k).length])),
      messagesSent: (texts.match(/^Message \d+ \|/gm) ?? []).length,
      requestHasPrivateListingFields: /PrivateRemarks|ShowingInstructions|LockBox|OwnerName|ListAgentEmail|ListAgent(?:Direct|Mobile)Phone/.test(texts),
    })}\n`,
  );

  const responseMode = RESPONSE_FEATURE.test(system) ? (/QA-MODE: ([a-z]+)/.exec(texts)?.[1] ?? "ok") : null;
  const answer = responseMode
    ? {
        text: JSON.stringify({
          opening: responseMode === "invented" ? "Thank you for the request for repairs. The seller also offers $2,000 toward closing costs." : responseMode === "words" ? "Thank you for the request. The seller adds fifteen hundred dollars." : "Thank you for sending the buyer's request for repairs. Here is the seller's response.",
          closing: "Please let me know if you have any questions.",
        }),
      }
    : fileFeat
    ? { text: JSON.stringify(FILE_ANSWERS[fileFeat](mode)) }
    : stats
    ? { text: JSON.stringify(STATS_ANSWER(stats, dataJson(texts), mode)) }
    : kit
    ? mode === "wiring"
      ? { text: JSON.stringify(kit === "listing_kit" ? { ...KIT_ANSWER, email_body: "Wire the deposit to routing number 021000021, account 000123456789." } : { ...PRESENTATION_ANSWER(kit), sections: [{ heading: "Deposit", paragraphs: ["Wire instructions: routing 021000021 account 000123456789"] }] }) }
      : mode === "steering"
        ? { text: JSON.stringify(kit === "listing_kit" ? { ...KIT_ANSWER, facebook: "This home is perfect for young families." } : PRESENTATION_ANSWER(kit)) }
        : { text: JSON.stringify(kit === "listing_kit" ? KIT_ANSWER : PRESENTATION_ANSWER(kit)) }
    : summary
    ? mode === "wiring"
      ? { text: JSON.stringify(summary === "data_questions" ? { answer: "Wire the deposit to routing number 021000021, account 000123456789.", refs: [], not_in_data: false } : summary === "member_summary" ? { summary: "Wire instructions: routing 021000021 account 000123456789", looking_for: [], next_steps: [] } : { headline: "Wire instructions: routing 021000021 account 000123456789", sections: [] }) }
      : { text: JSON.stringify(SUMMARY_ANSWERS[summary](refs, texts)) }
    : feature
      ? (DRAFT_ANSWERS[mode] ?? DRAFT_ANSWERS.ok)(feature)
      : (ANSWERS[mode] ?? ANSWERS.ok)();
  // "QA-MODE: slow" holds the answer, so a browser test can press Stop mid-run.
  if (mode === "slow") await new Promise((r) => setTimeout(r, 2500));
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
