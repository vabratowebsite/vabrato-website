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
  wiring: () => ({ text: JSON.stringify(reading({ notes: ["Wire the deposit to routing number 999999999, account 000123456789."] })) }),
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
  // S5b PR 2: Ask Vabrato's document summary (modes from the file's bytes).
  ["member_summarize", /A member shares one of their own documents/],
];
// S6b PR 7b: the response's opening and closing; the mode comes from the
// agent's note ("QA-MODE: invented" adds an amount, "words" spells one out).
const RESPONSE_FEATURE = /write the seller's response to the buyer's request for repairs/;
// S6b PR 8: call notes and appointment drafts; the mode comes from the
// person's notes or sentence ("QA-MODE: …").
const CALL_FEATURE = /after a phone call/;
const APPT_FEATURE = /set up an appointment/;
const todayIn = (texts) => /\((\d{4}-\d{2}-\d{2})\)/.exec(texts)?.[1] ?? new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const CALL_ANSWER = (mode) => ({
  todos: [
    { title: "Send the HOA documents to the buyer's agent", due_in_days: 1 },
    { title: "Book the stager for a walkthrough, call 650-555-0123", due_in_days: 3 },
    { title: "Send the HOA documents to the buyer's agent", due_in_days: 2 },
    { title: "Confirm the final walkthrough time", due_in_days: null },
  ],
  followup:
    mode === "nofollowup"
      ? null
      : mode === "wiring"
        ? { subject: "Deposit", body: "Hi Dana,\n\nWire the deposit to routing number 999999999, account 000123456789.\n\nAvery" }
        : { subject: "Thanks for the call", body: "Hi Dana,\n\nThanks for the call today. I'll send the HOA documents tomorrow and book the stager this week.\n\nAvery" },
});
const APPT_ANSWER = (mode, texts) => {
  const today = todayIn(texts);
  // "Next Tuesday" from today's date in the request.
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const tuesday = plusDays(today, ((2 - dow + 7) % 7) || 7);
  return {
    title: "Final walkthrough",
    date: mode === "past" ? plusDays(today, -1) : tuesday,
    start: mode === "notime" ? null : "15:00",
    minutes: 45,
    location: "the property",
    with: "Dana",
    subject: "Final walkthrough on [when]",
    body: "Hi Dana,\n\nJust confirming our final walkthrough on [when] at the property. It should take about 45 minutes.\n\nAvery",
  };
};
// S5b PR 1: Ask Vabrato's member features; the mode comes from the member's
// own words ("QA-MODE: wiring|steering|refusal|extra|elsewhere").
const MEMBER_EXPLAIN = /explain it in plain, friendly language/i;
const MEMBER_SEARCH = /Turn it into the website's search filters/;
const EXPLAIN_ANSWER = (mode) =>
  mode === "wiring"
    ? { text: "An earnest money deposit is wired to escrow: routing number 999999999, account 000123456789." }
    : mode === "steering"
      ? { text: "A starter home is perfect for young families." }
      : mode === "refusal"
        ? { text: "", stop: "refusal" }
        : { text: "**Contingency removal** is when the buyer formally gives up a condition in the contract, such as the inspection or loan contingency.\n\nIn California this is usually done in writing by a set date. The details depend on your contract, so ask your agent about yours." };
const SEARCH_ANSWER = (mode, texts) => {
  // The member's sentence is the last text block; the city list comes as data before it.
  const sentence = texts.split("\n").filter(Boolean).pop() ?? "";
  const cities = [...texts.matchAll(/^([a-z0-9-]+): (.+)$/gm)].filter(([, , name]) => sentence.toLowerCase().includes(name.toLowerCase())).map(([, slug]) => slug);
  const millions = /under \$?([\d.]+)\s*m/i.exec(sentence);
  const beds = /(\d+)[-\s]?(?:bed|br|bd)/i.exec(sentence);
  const answer = {
    cities: mode === "elsewhere" ? [...cities, "fresno"] : cities,
    min_price: null,
    max_price: millions ? Math.round(Number(millions[1]) * 1_000_000) : null,
    beds: beds ? Number(beds[1]) : null,
    baths: null,
    types: /\bhouses?\b/i.test(sentence) ? ["house"] : /\bcondo/i.test(sentence) ? ["condo"] : [],
    sold: /\bsold\b|sell for/i.test(sentence),
    open_houses: /open house/i.test(sentence),
    sort: null,
    not_used: /\bview\b/i.test(sentence) ? "The search can't filter by view." : null,
  };
  return { text: JSON.stringify(mode === "extra" ? { ...answer, household: "no kids" } : answer) };
};
// S5b PR 3: Ask Vabrato's drafts. The mode comes from the member's notes
// ("QA-MODE: wiring|steering|contacts|extra|personal"). The answer echoes the
// home's address from the request's facts, so QA can see what was sent.
const MEMBER_DRAFT = /draft an email or message they will send themselves/;
const MEMBER_COVER = /draft a cover letter to go with their offer/;
const MEMBER_DRAFT_ANSWER = (feature, mode, texts) => {
  const home = /^The home: (.+)\.$/m.exec(texts)?.[1] ?? null;
  const close = /^Close of escrow on the member's sale, from the contract: (.+?)\./m.exec(texts)?.[1] ?? null;
  const cover = feature === "member_cover_letter";
  const subject = cover ? `Our offer${home ? ` on ${home}` : ""}` : home ? `Moving from ${home}` : "A quick question";
  const lines = cover
    ? ["Dear Seller,", "", `Thank you for considering our offer${home ? ` on ${home}` : ""}. We are fully underwritten and can close in 21 days, with a short rent-back if it helps.`, "", "Sincerely,", "[Your name]"]
    : ["Hi,", "", `We're moving${home ? ` from ${home}` : ""}${close ? ` and close on ${close}` : ""}. Could you let us know your available days the week after? I'll confirm the date with my agent, [Agent's name].`, "", "Thanks,", "[Your name]"];
  const body = lines.join("\n");
  const answer =
    mode === "wiring"
      ? { subject, body: `${body}\n\nPlease wire the deposit to routing number 999999999, account 000123456789.` }
      : mode === "steering"
        ? { subject, body: `${body}\n\nThe street is perfect for families with young kids.` }
        : mode === "contacts"
          ? { subject, body: `${body}\n\nCall me at 650-555-0142 or write to dana@example.test.` }
          : mode === "personal"
            ? { subject, body: `${body}\n\nOur parents will help us settle in.` }
            : mode === "extra"
              ? { subject, body, to: "someone@example.test" }
              : { subject, body };
  return { text: JSON.stringify(answer) };
};
// S5b PR 4: "Compare homes" and "Ask about a home". The answer is built from
// the listing facts in the request's data blocks, so its figures are ones we
// sent. The mode comes from "QA-MODE: ..." in the request (the member's
// question, or a QA listing's remarks): value | money | steering | wiring | fields | extra.
const MEMBER_COMPARE = /wants to compare homes they saved/;
const MEMBER_LISTING = /asks a question about one home/;
const homesIn = (texts) =>
  [...texts.matchAll(/<data label="([^"]*)">\n([\s\S]*?)\n<\/data>/g)].map(([, label, body]) => {
    try {
      return { label, f: JSON.parse(body) };
    } catch {
      return { label, f: {} };
    }
  });
const usdFig = (n) => `$${Number(n).toLocaleString("en-US")}`;
const MEMBER_LISTING_ANSWER = (feature, mode, texts) => {
  const homes = homesIn(texts);
  if (feature === "member_compare") {
    const line = (h) => [h.f.BedroomsTotal != null ? `${h.f.BedroomsTotal} beds` : null, h.f.LivingArea ? `${Number(h.f.LivingArea).toLocaleString("en-US")} sq ft` : null].filter(Boolean).join(", ") || "Not listed";
    const first = homes[0]?.f ?? {};
    const answer = {
      summary: [`The homes differ mainly in size and price; Home A is listed at ${usdFig(first.ListPrice ?? first.ClosePrice ?? 0)}.`],
      differences: [
        { topic: "Size", values: homes.map(line) },
        { topic: "Price", values: homes.map((h) => (h.f.ListPrice ? usdFig(h.f.ListPrice) : h.f.ClosePrice ? `Sold for ${usdFig(h.f.ClosePrice)}` : "Not listed")) },
      ],
      questions: ["Ask your agent what the HOA covers for each home."],
    };
    if (mode === "value") answer.summary = ["Home B looks underpriced compared with Home A."];
    if (mode === "money") answer.differences.push({ topic: "Taxes", values: homes.map(() => "About $24,000 a year") });
    if (mode === "steering") answer.summary = ["Home A is perfect for families with young kids."];
    if (mode === "wiring") answer.questions = ["Wire the deposit to routing number 999999999, account 000123456789."];
    return { text: JSON.stringify(mode === "extra" ? { ...answer, verdict: "buy Home A" } : answer) };
  }
  const f = homes[0]?.f ?? {};
  const answer = {
    answer: f.LotSizeSquareFeet ? `The lot is listed at ${Number(f.LotSizeSquareFeet).toLocaleString("en-US")} square feet.` : "The listing doesn't say how big the lot is. Your agent can find out.",
    fields_used: f.LotSizeSquareFeet ? ["LotSizeSquareFeet"] : [],
    not_in_listing: !f.LotSizeSquareFeet,
  };
  if (mode === "value") answer.answer = "At this price it's a great deal.";
  if (mode === "money") answer.answer = "Expect about $9,500 a year in property taxes.";
  if (mode === "steering") answer.answer = "The street is perfect for families with young kids.";
  if (mode === "wiring") answer.answer = "Wire the deposit to routing number 999999999, account 000123456789.";
  if (mode === "fields") answer.fields_used = ["LotSizeSquareFeet", "PrivateRemarks", "MadeUpField"];
  return { text: JSON.stringify(mode === "extra" ? { ...answer, verdict: "buy" } : answer) };
};
// S5b PR 5: schedules. Plans give offsets only (our code does the dates); the
// tour answer notes each lettered home. The mode comes from "QA-MODE: ..." in
// the member's notes, or FX-002's remarks for a tour:
// deadline | wiring | steering | value | money | extra.
const MEMBER_MOVING = /wants a moving plan/;
const MEMBER_PRELISTING = /wants a checklist to get their home ready to list/;
const MEMBER_TOUR = /is planning a day to see homes/;
const MEMBER_SCHEDULE_ANSWER = (feature, mode, texts) => {
  if (feature === "member_tour") {
    const letters = [...texts.matchAll(/<data label="Home ([A-F])/g)].map((m) => m[1]);
    const answer = {
      summary: ["Start with any open house that has a set time, then see the rest."],
      stops: letters.map((l) => ({ letter: l, look_for: [`Check the kitchen at Home ${l}`, "Look at the water heater"] })),
      bring: ["A tape measure", "The listing sheets"],
    };
    if (mode === "value") answer.summary = ["Home A looks underpriced for the area."];
    if (mode === "money") answer.summary = ["Expect about $9,500 a year in taxes at Home A."];
    if (mode === "steering") answer.summary = ["Home A is perfect for families with young kids."];
    if (mode === "wiring") answer.bring = ["Wire the deposit to routing number 999999999, account 000123456789."];
    return { text: JSON.stringify(mode === "extra" ? { ...answer, verdict: "buy Home A" } : answer) };
  }
  const moving = feature === "member_moving";
  const tasks = moving
    ? [
        { title: "Book movers", detail: "Get three written quotes.", offset_days: -21, category: "movers" },
        { title: "Start packing rooms you use least", detail: "Label boxes by room.", offset_days: -14, category: "packing" },
        { title: "Forward your mail", detail: "Set it up a week ahead.", offset_days: -7, category: "address" },
        { title: "Schedule utilities", detail: "Stop or transfer them for move day.", offset_days: -3, category: "utilities" },
        { title: "Final walk-through and keys", detail: "Leave the home clean.", offset_days: 0, category: "cleaning" },
      ]
    : [
        { title: "Fix small repairs", detail: "Dripping faucets, loose handles.", offset_days: -28, category: "repairs" },
        { title: "Deep clean", detail: "Windows, carpets and the kitchen.", offset_days: -14, category: "cleaning" },
        { title: "Stage the main rooms", detail: "Clear counters and surfaces.", offset_days: -10, category: "staging" },
        { title: "Book the photographer", detail: "A week ahead of the list date.", offset_days: -7, category: "photos" },
        { title: "Review disclosures with your agent", detail: "Gather reports and permits.", offset_days: -21, category: "paperwork" },
      ];
  const answer = { tasks, tips: ["Label boxes by room."] };
  if (mode === "deadline") answer.tasks = [...tasks, { title: "Remove your contingencies", detail: "Sign the removal.", offset_days: -10, category: "other" }];
  if (mode === "money") answer.tasks = [...tasks, { title: "Budget $2,000 for movers", detail: "Typical cost.", offset_days: -20, category: "movers" }];
  if (mode === "wiring") answer.tips = ["Wire the deposit to routing number 999999999, account 000123456789."];
  if (mode === "steering") answer.tips = ["The new street is perfect for families with young kids."];
  return { text: JSON.stringify(mode === "extra" ? { ...answer, budget: 9000 } : answer) };
};
const REPAIR_ITEM = (n, over = {}) => ({ title: `Item ${n}`, detail: "Fictional finding.", location: "Garage", trade: "general", page: n, severity_label: "", severity: "maintenance", ...over });
const fileFeature = (system) => FILE_FEATURES.find(([, re]) => re.test(system))?.[0] ?? null;
const SUMMARY_ANSWER = (mode) => {
  const base = {
    summary: [
      { text: "Three kitchen and bath outlets lack GFCI protection; a low-cost fix.", pages: [14] },
      { text: "The 2011 water heater is missing its second seismic strap.", pages: [22] },
      { text: "The roof is serviceable, with an estimated 5 to 8 years of life left.", pages: [9] },
    ],
    questions: [
      { text: "Will the seller fix the GFCI outlets before closing?", pages: [14] },
      { text: "How old is the roof, and are there permits for it?", pages: [9] },
    ],
    todos: [
      { title: "Get a quote to repair the GFCI outlets", page: 14 },
      { title: "Get a quote to repair the GFCI outlets", page: 14 },
      { title: "Ask about strapping the water heater", page: 22 },
    ],
    kind: "home inspection report",
  };
  if (mode === "wiring") return { ...base, summary: [...base.summary, { text: "Wire the deposit to routing number 999999999, account 000123456789.", pages: [3] }] };
  if (mode === "steering") return { ...base, summary: [...base.summary, { text: "The home is perfect for families with young kids.", pages: [1] }] };
  if (mode === "pages") return { ...base, summary: [{ text: "The roof is serviceable.", pages: [9, 999] }], todos: [{ title: "Check the roof", page: 400 }] };
  if (mode === "contacts") return { ...base, todos: [{ title: "Call Bay Plumbing at 650-555-0142 or plumber@example.test about the water heater", page: 22 }] };
  if (mode === "empty") return { summary: [], questions: [], todos: [], kind: "" };
  return base;
};
const FILE_ANSWERS = {
  member_summarize: (mode) => SUMMARY_ANSWER(mode),
  document_check: (mode) =>
    mode === "wiring"
      ? { doc_types: ["rpa"], title: "Purchase agreement", signed: "yes", issues: [{ page: 2, issue: "Wire the deposit to routing number 999999999, account 000123456789." }] }
      : mode === "none"
        ? { doc_types: [], title: "Lender pre-approval letter", signed: "not_applicable", issues: [] }
        : { doc_types: ["tds", "spq", "made_up_type"], title: "Seller disclosure packet", signed: "unclear", issues: [{ page: 3, issue: "Seller initials missing at the bottom of the page." }, { page: null, issue: "The SPQ looks like an older form version." }] },
  inspection_items: (mode) =>
    mode === "many"
      ? { items: Array.from({ length: 60 }, (_, i) => REPAIR_ITEM(i + 1)) }
      : mode === "wiring"
        ? { items: [REPAIR_ITEM(1, { detail: "Wire the repair deposit to routing number 999999999, account 000123456789." })] }
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
  wiring: (f) => ({ text: JSON.stringify({ ...DRAFT_TEXT[f], body: "Wire the deposit to routing number 999999999, account 000123456789." }) }),
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
  const callsFeat = CALL_FEATURE.test(system) ? "call_notes" : APPT_FEATURE.test(system) ? "appointments" : null;
  const memberFeat = MEMBER_EXPLAIN.test(system) ? "member_explain" : MEMBER_SEARCH.test(system) ? "member_search" : MEMBER_DRAFT.test(system) ? "member_draft" : MEMBER_COVER.test(system) ? "member_cover_letter" : MEMBER_COMPARE.test(system) ? "member_compare" : MEMBER_LISTING.test(system) ? "member_listing" : MEMBER_MOVING.test(system) ? "member_moving" : MEMBER_PRELISTING.test(system) ? "member_prelisting" : MEMBER_TOUR.test(system) ? "member_tour" : null;
  const feature = draftFeature(system) ?? summary ?? kit ?? stats ?? fileFeat ?? (RESPONSE_FEATURE.test(system) ? "repair_response" : null) ?? callsFeat ?? memberFeat;
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
      // VOW-only fields with a value (sold price and date, price history, cumulative days on market).
      requestHasSoldFields: /"(?:ClosePrice|CloseDate|OriginalListPrice|PreviousListPrice|CumulativeDaysOnMarket)":(?!null)/.test(texts),
      requestHasInternalNote: /X_FixtureInternalNote|ListOfficePhone/.test(texts),
      requestListingKeys: [...new Set(texts.match(/FX-\d{3}/g) ?? [])],
    })}\n`,
  );

  const responseMode = RESPONSE_FEATURE.test(system) ? (/QA-MODE: ([a-z]+)/.exec(texts)?.[1] ?? "ok") : null;
  const answer = memberFeat
    ? memberFeat === "member_explain"
      ? EXPLAIN_ANSWER(mode)
      : memberFeat === "member_search"
        ? SEARCH_ANSWER(mode, texts)
        : memberFeat === "member_compare" || memberFeat === "member_listing"
          ? MEMBER_LISTING_ANSWER(memberFeat, mode, texts)
          : memberFeat === "member_moving" || memberFeat === "member_prelisting" || memberFeat === "member_tour"
            ? MEMBER_SCHEDULE_ANSWER(memberFeat, mode, texts)
          : MEMBER_DRAFT_ANSWER(memberFeat, mode, texts)
    : callsFeat
    ? { text: JSON.stringify(callsFeat === "call_notes" ? CALL_ANSWER(mode) : APPT_ANSWER(mode, texts)) }
    : responseMode
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
      ? { text: JSON.stringify(kit === "listing_kit" ? { ...KIT_ANSWER, email_body: "Wire the deposit to routing number 999999999, account 000123456789." } : { ...PRESENTATION_ANSWER(kit), sections: [{ heading: "Deposit", paragraphs: ["Wire instructions: routing 999999999 account 000123456789"] }] }) }
      : mode === "steering"
        ? { text: JSON.stringify(kit === "listing_kit" ? { ...KIT_ANSWER, facebook: "This home is perfect for young families." } : PRESENTATION_ANSWER(kit)) }
        : { text: JSON.stringify(kit === "listing_kit" ? KIT_ANSWER : PRESENTATION_ANSWER(kit)) }
    : summary
    ? mode === "wiring"
      ? { text: JSON.stringify(summary === "data_questions" ? { answer: "Wire the deposit to routing number 999999999, account 000123456789.", refs: [], not_in_data: false } : summary === "member_summary" ? { summary: "Wire instructions: routing 999999999 account 000123456789", looking_for: [], next_steps: [] } : { headline: "Wire instructions: routing 999999999 account 000123456789", sections: [] }) }
      : { text: JSON.stringify(SUMMARY_ANSWERS[summary](refs, texts)) }
    : feature
      ? (DRAFT_ANSWERS[mode] ?? DRAFT_ANSWERS.ok)(feature)
      : (ANSWERS[mode] ?? ANSWERS.ok)();
  // "QA-MODE: slow" holds the answer, so a browser test can press Stop mid-run.
  if (mode === "slow") await new Promise((r) => setTimeout(r, 2500));
  const usage = { input_tokens: 61000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  // S6b PR 9: "QA-FALLBACK" in the request: report a server-side fallback, the
  // way the API does (usage.iterations: the declined attempt and the answer).
  const fallback = /QA-FALLBACK/.test(texts);
  const answeredBy = fallback ? (body.fallbacks?.[0]?.model ?? "claude-opus-4-8") : body.model;
  const iterations = fallback
    ? [
        { type: "message", model: null, input_tokens: 61000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
        { type: "fallback_message", model: answeredBy, input_tokens: 61000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
      ]
    : null;
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  send(res, "message_start", { message: { id: "msg_qa_local", type: "message", role: "assistant", model: answeredBy, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
  send(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < answer.text.length; i += 400) send(res, "content_block_delta", { index: 0, delta: { type: "text_delta", text: answer.text.slice(i, i + 400) } });
  send(res, "content_block_stop", { index: 0 });
  send(res, "message_delta", { delta: { stop_reason: answer.stop ?? "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens, ...(iterations ? { iterations } : {}) } });
  send(res, "message_stop", {});
  res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`fake Claude on http://127.0.0.1:${PORT}, logging to ${LOG}`));
