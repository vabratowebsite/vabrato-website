// S6b PR 5 end-to-end check: listing launch kits and printable presentations,
// on the local stack with the fake Claude server (fake-claude.mjs): no key,
// no cost, nothing leaves the machine.
//
// - Off by default: no "Launch kit" link, the kit page is a 404, Presentations
//   says it's off.
// - Launch kit for one of our listings (FX-001): written from the public
//   listing facts only; an MLS description with a phone number can't be
//   approved; approved parts copy; the flyer prints our facts and the agent's
//   own phone from their profile. A draft has no flyer; another brokerage's
//   listing (FX-002) has no kit; a wiring answer isn't shown.
// - Listing and buyer presentations: written, approved, printed with the
//   agent card, services and the schedule engine's timeline; another agent
//   can't open them.
// - "My drafts" links them; switched off again. axe at 1440 and 390 px.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG, migration 0030 and the preview seed (FX-001 ours,
// FX-002 not). Fictional people; everything it adds is removed at the end.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-kits");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const last = () => asked().at(-1) ?? {};
const OWN = "FX-001";
const OTHER = "FX-002";

async function account(first, role) {
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  const res = await fetch(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54331"}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: process.env.SERVICE_KEY, Authorization: `Bearer ${process.env.SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create ${first}: ${res.status} ${await res.text()}`);
  const id = (await res.json()).id;
  sql(`update profiles set role = '${role}', full_name = '${first} Example' where id = '${id}'`);
  return { id, email };
}

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: VA });
  const page = await ctx.newPage();
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const sent = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, sent));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

async function shots(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Presses a button and waits for this request's own outcome (pages have other alerts). */
async function press(page, button, ready, refused) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const target = refused ? page.getByRole("alert").filter({ hasText: refused }) : page.getByRole("status").filter({ hasText: ready });
  try {
    await target.first().waitFor({ timeout: 30000 });
  } catch {
    throw new Error(`"${button}": no ${refused ?? ready}; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}`);
  }
}
const kitRow = (where) => sql(`select coalesce(string_agg(status || ':' || coalesce(sent_via, '-'), ',' order by created_at), '') from ai_drafts where ${where}`);

// --- Setup ---------------------------------------------------------------------------------------
const FLAGS = "('ai_enabled', 'ai_staff_listing_kit', 'ai_staff_presentations')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`update app_settings set ai_monthly_budget_usd = 100, ai_daily_requests_staff = 100`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)'`);
const slug = `qa-avery-${stamp}`;
sql(`insert into agent_profiles (slug, profile_id, display_name, title, bio, phone, email, published) values ('${slug}', '${avery.id}', 'Avery Example', 'Realtor', 'Fifteen years helping Peninsula families buy and sell homes.', '650-555-0142', 'avery.${stamp}@example.test', false)`);
const flags = (on) => sql(`update feature_flags set enabled = ${on} where key in ${FLAGS}`);

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  await av.goto(`${VA}/listings`);
  check("off: no launch kit link on Our listings", (await av.getByRole("link", { name: /^Launch kit/ }).count()) === 0);
  check("off: the kit page isn't there", (await av.goto(`${VA}/listings/${OWN}/kit`)).status() === 404);
  await av.goto(`${VA}/presentations`);
  check("off: Presentations says it's off", await av.getByRole("heading", { name: "Presentations are off" }).isVisible());

  flags(true);

  // 2. Launch kit.
  await av.goto(`${VA}/listings`);
  const link = av.getByRole("link", { name: /^Launch kit/ }).first();
  check("on: our listings have a launch kit link", await link.isVisible());
  check("another brokerage's listing has no kit page", (await av.goto(`${VA}/listings/${OTHER}/kit`)).status() === 404);
  await av.goto(`${VA}/listings/${OWN}/kit`);
  await av.getByLabel("What should it highlight? (optional)").fill("New roof in 2024; walk to the park.");
  await press(av, "Write launch kit", "Kit ready.");
  let req = last();
  check("kit: written from the public listing facts only", req.feature === "listing_kit" && req.dataBlocks === 1 && !req.requestHasEmail && !req.requestHasPhone && !req.requestHasLockbox && !req.requestHasPrivateListingFields && req.effort === "medium" && req.format === "json_schema", JSON.stringify(req));
  check("kit: every part is filled in for editing", (await av.getByLabel("MLS description").inputValue()).startsWith("Light-filled three-bedroom") && (await av.getByLabel("Flyer: highlights (one per line, up to 6)").inputValue()) === "Remodeled kitchen\nSunny yard\nThree bedrooms\nWalk to the park");
  check("kit: saved as the agent's own draft", kitRow(`kind = 'listing_kit' and owner_id = '${avery.id}'`) === "draft:-");
  await axeAll(av, "/listings/[key]/kit (draft)");
  await shots(av, "kit-draft");

  const mls = av.getByLabel("MLS description");
  const original = await mls.inputValue();
  await mls.fill(`${original} Call Avery at 650-555-0142.`);
  await press(av, "Approve", null, "MLS rules");
  check("kit: an MLS description with a phone number can't be approved, and the edit is kept", kitRow(`kind = 'listing_kit' and owner_id = '${avery.id}'`) === "draft:-" && (await mls.inputValue()).includes("650-555-0142"));
  await mls.fill(original);
  await press(av, "Approve", "Approved.");
  check("kit: approved and read-only", kitRow(`kind = 'listing_kit' and owner_id = '${avery.id}'`) === "approved:-" && (await mls.getAttribute("readonly")) !== null);
  await av.getByRole("button", { name: "Copy MLS description" }).click();
  await av.getByRole("status").filter({ hasText: "Copied: MLS description." }).waitFor();
  check("kit: a part copies on its own", (await av.evaluate(() => navigator.clipboard.readText())) === original && kitRow(`kind = 'listing_kit' and owner_id = '${avery.id}'`) === "approved:copy");
  const kitId = sql(`select id from ai_drafts where kind = 'listing_kit' and owner_id = '${avery.id}' and status = 'approved'`);

  await av.getByRole("link", { name: "Print the flyer" }).click();
  await av.waitForURL(new RegExp(`/listings/${OWN}/kit/${kitId}/flyer$`));
  const flyer = av.getByRole("article", { name: "Flyer" });
  check(
    "flyer: the approved text with our facts and the agent's own contact details",
    (await flyer.getByRole("heading", { name: "Light-filled in San Carlos" }).isVisible()) &&
      (await flyer.getByText("Walk to the park").isVisible()) &&
      (await flyer.getByText(/650-555-0142/).isVisible()) &&
      (await flyer.getByText(/Equal Housing Opportunity/).isVisible()),
  );
  check("flyer: printing is recorded", sql(`select sent_via from ai_drafts where id = '${kitId}'`) === "print");
  await axeAll(av, "/listings/[key]/kit/[id]/flyer");
  await shots(av, "flyer");
  await av.emulateMedia({ media: "print" });
  check("flyer: the print view has no console frame or buttons", (await av.getByRole("button", { name: "Print or save as PDF" }).isHidden()) && (await av.getByRole("link", { name: "← Back to the launch kit" }).isHidden()));
  await av.emulateMedia({ media: "screen" });

  await av.goto(`${VA}/listings/${OWN}/kit`);
  await av.getByRole("button", { name: "Write another kit" }).click();
  await av.getByLabel("What should it highlight? (optional)").fill("QA-MODE: wiring");
  await press(av, "Write launch kit", null, "payment or wiring");
  check("kit: an answer with wiring details isn't shown or saved", sql(`select count(*) from ai_drafts where kind = 'listing_kit' and owner_id = '${avery.id}'`) === "1");
  await av.getByLabel("What should it highlight? (optional)").fill("");
  await press(av, "Write launch kit", "Kit ready.");
  const draftId = sql(`select id from ai_drafts where kind = 'listing_kit' and owner_id = '${avery.id}' and status = 'draft'`);
  check("kit: a draft has no flyer", (await av.goto(`${VA}/listings/${OWN}/kit/${draftId}/flyer`)).status() === 404);

  // 3. Presentations.
  await av.goto(`${VA}/presentations`);
  await av.getByLabel("Listing presentation (for a seller)").check();
  await av.getByLabel("Client's first name (optional)").fill("Dana");
  await av.getByLabel("Their home's address and city (optional)").fill("12 Fictional Lane, San Carlos");
  await av.getByRole("button", { name: "Write presentation" }).click();
  await av.waitForURL(/\/presentations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  req = last();
  check("listing presentation: written with the agent's profile; no contacts sent", req.feature === "listing_presentation" && !req.requestHasEmail && !req.requestHasPhone && req.dataBlocks === 1, JSON.stringify(req));
  const presId = av.url().split("/").pop();
  check("listing presentation: title and sections to edit", (await av.getByLabel("Title").inputValue()) === "Selling your home with Vabrato" && (await av.getByLabel("Section 1: heading").inputValue()) === "Welcome");
  await axeAll(av, "/presentations/[id] (draft)");
  await shots(av, "presentation-draft");
  check("a draft presentation can't be printed", (await (await av.context().newPage()).goto(`${VA}/presentations/${presId}/print`)).status() === 404);
  await press(av, "Approve", "Approved.");
  await av.getByRole("link", { name: "Print or save as PDF" }).click();
  await av.waitForURL(new RegExp(`/presentations/${presId}/print$`));
  const doc = av.getByRole("article", { name: "Listing presentation" });
  check(
    "listing presentation print: the pages, the agent card, services and the schedule engine's timeline",
    (await doc.getByRole("heading", { name: "Selling your home with Vabrato" }).isVisible()) &&
      (await doc.getByText("Fifteen years helping Peninsula families buy and sell homes.").isVisible()) &&
      (await doc.getByText(/Day 7:/).isVisible()) &&
      (await doc.getByText("Close of escrow").isVisible()),
  );
  await axeAll(av, "/presentations/[id]/print");
  await shots(av, "presentation-print");

  await av.goto(`${VA}/presentations`);
  await av.getByLabel("Buyer presentation").check();
  await av.getByLabel("Where they're looking (optional)").fill("Belmont or San Carlos");
  await av.getByRole("button", { name: "Write presentation" }).click();
  await av.waitForURL(/\/presentations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  check("buyer presentation: written", last().feature === "buyer_presentation" && (await av.getByLabel("Title").inputValue()) === "Buying a home with Vabrato");
  const buyerId = av.url().split("/").pop();

  const bl = await signIn(blake.email);
  check("another agent can't open someone's presentation or kit flyer", (await bl.goto(`${VA}/presentations/${presId}`)).status() === 404 && (await bl.goto(`${VA}/listings/${OWN}/kit/${kitId}/flyer`)).status() === 404);
  await bl.context().close();

  // 4. My drafts.
  await av.goto(`${VA}/assistant`);
  check("My drafts: the kit and presentations, linked", (await av.getByRole("link", { name: "Selling your home with Vabrato" }).getAttribute("href")) === `/presentations/${presId}` && (await av.getByRole("link", { name: "Buying a home with Vabrato" }).getAttribute("href")) === `/presentations/${buyerId}` && (await av.getByRole("link", { name: /^Launch kit: Light-filled/ }).first().getAttribute("href")) === `/listings/${OWN}/kit`);
  check("the usage log has metadata only", sql(`select string_agg(feature || ':' || status, ',' order by created_at) from ai_runs`) === "staff_listing_kit:ok,staff_listing_kit:blocked_output,staff_listing_kit:ok,staff_presentations:ok,staff_presentations:ok");

  // 5. Off again.
  flags(false);
  await av.goto(`${VA}/presentations`);
  check("off again: presentations say so; no kit page", (await av.getByRole("heading", { name: "Presentations are off" }).isVisible()) && (await av.goto(`${VA}/listings/${OWN}/kit`)).status() === 404);
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  flags(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null`);
  sql(`delete from ai_drafts where owner_id in ('${avery.id}', '${blake.id}', '${ada.id}'); delete from agent_profiles where slug = '${slug}'; delete from ai_runs`);
  await browser.close();
}
done();
