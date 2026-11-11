// S6 PR 4 end-to-end check: content with approval (an agent drafts a post,
// the Fair Housing check blocks "perfect for young families", the fixed post
// goes to Mark, Mark publishes it and the website shows it), a testimonial
// sent back with a note, the agent's own profile and photo (a real PNG is
// accepted, an SVG renamed .png is refused, the About page shows the photo),
// and featured listings (a pinned listing leads the home page; a sold one
// can't be pinned). axe at 1440 and 390 px on every new page.
// Same local stack as s6-leads-ui.mjs, with apps/web on 3003 and the console
// started with WEB_REVALIDATE_URL + REVALIDATE_SECRET (same secret as the
// website). Needs SERVICE_KEY and the local storage shim. Fictional people,
// copy and fixture listings only; restores the profile and pins at the end.

import { BASE, axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const agentEmail = `casey.agent.${stamp}@example.test`;
const slug = `qa-post-${stamp}`;

async function consoleSignIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
sql(`update app_settings set lead_admin_id = '${mark}', lead_admin_away = false, lead_admin_away_until = null`);
const authRes = await fetch(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54331"}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: process.env.SERVICE_KEY ?? "", Authorization: `Bearer ${process.env.SERVICE_KEY ?? ""}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: agentEmail, email_confirm: true }),
});
if (!authRes.ok) throw new Error(`create agent: ${authRes.status} ${await authRes.text()}`);
const agent = (await authRes.json()).id;
sql(`update profiles set role = 'agent', full_name = 'Casey Agent ${stamp}' where id = '${agent}'`);
// Link the fictional agent to the Viv profile for the photo check (restored at the end).
const vivBefore = sql(`select coalesce(profile_id::text, '') || '|' || coalesce(photo_path, '') || '|' || published from agent_profiles where slug = 'viv-kelvin'`);
sql(`update agent_profiles set profile_id = '${agent}', published = true where slug = 'viv-kelvin'`);
sql(`delete from featured_listings`);

try {
  // 1. The agent drafts a post; the Fair Housing check blocks it.
  const a = await consoleSignIn(agentEmail);
  await a.goto(`${VA}/content`);
  await axeAll(a, "/content (agent)");
  await a.goto(`${VA}/content/edit?table=posts`);
  await axeAll(a, "/content/edit posts");
  await a.getByLabel("Title").fill(`QA ${stamp}: perfect for young families`);
  await a.getByLabel("Web address").fill(slug);
  await a.getByLabel("Summary").fill("A fictional QA post.");
  await a.getByLabel("Article").fill("## Downtown\n\nLaurel Street has **cafes** and a [library](https://example.test/library).\n\n<script>alert(1)</script>");
  await a.getByRole("button", { name: "Save draft" }).click();
  await a.waitForURL(/\/content\/[0-9a-f-]{36}\?saved=1/);
  const rev = a.url().match(/content\/([0-9a-f-]{36})/)[1];
  check("draft saved and shown", await a.getByText("Draft saved.").isVisible());
  check("the FH check flags the phrase", await a.getByText("Must change").first().isVisible());
  check("the preview renders Markdown without raw HTML", (await a.locator("main h2", { hasText: "Downtown" }).count()) === 1 && !(await a.content()).includes("<script>alert(1)"));
  await axeAll(a, "/content/[id] draft");
  await a.getByRole("button", { name: "Send for approval" }).click();
  await a.getByRole("alert").filter({ hasText: /Reword before sending/ }).waitFor();
  check("sending is blocked until reworded", sql(`select status from content_revisions where id = '${rev}'`) === "draft");
  await a.getByRole("link", { name: "Edit" }).click();
  await a.getByLabel("Title").fill(`QA ${stamp}: three bedrooms near Caltrain`);
  await a.getByRole("button", { name: "Save draft" }).click();
  await a.waitForURL(new RegExp(`/content/${rev}\\?saved=1`));
  await a.getByRole("button", { name: "Send for approval" }).click();
  await a.getByText("Sent to Mark for approval.").waitFor();
  check("the agent can't publish", (await a.getByRole("button", { name: "Approve and publish" }).count()) === 0);
  check("the live site doesn't have it yet", (await fetch(`${BASE}/insights/${slug}`)).status === 404);

  // 2. Mark publishes it; the website shows it.
  const m = await consoleSignIn(STAFF_EMAIL);
  await m.goto(`${VA}/content`);
  check("Mark's queue lists it", await m.getByRole("link", { name: new RegExp(`QA ${stamp}: three bedrooms`) }).isVisible());
  await axeAll(m, "/content (lead admin)");
  await m.goto(`${VA}/content/${rev}`);
  await axeAll(m, "/content/[id] submitted");
  await m.getByRole("button", { name: "Approve and publish" }).click();
  await m.getByText(/Published\. The website is updated\./).waitFor();
  check("published with approver recorded", sql(`select published::text || '|' || is_placeholder::text || '|' || (approved_by = '${mark}')::text from posts where slug = '${slug}'`) === "true|false|true");
  const live = await (await fetch(`${BASE}/insights/${slug}`)).text();
  check("the website shows the post right away", live.includes("three bedrooms near Caltrain") && !live.includes("<script>alert(1)"));
  check("publish is audited", sql(`select count(*) from staff_audit where action = 'publish_content' and ref_id = '${slug}'`) === "1");

  // 3. A testimonial without permission is sent back with a note.
  await a.goto(`${VA}/content/edit?table=testimonials`);
  await axeAll(a, "/content/edit testimonials");
  await a.getByLabel("Name as shown").fill("Robin Q.");
  await a.getByRole("textbox", { name: "Quote (required)" }).fill(`QA ${stamp}: fictional quote.`);
  await a.getByRole("button", { name: "Save draft" }).click();
  await a.waitForURL(/\/content\/[0-9a-f-]{36}\?saved=1/);
  const tRev = a.url().match(/content\/([0-9a-f-]{36})/)[1];
  await a.getByRole("button", { name: "Send for approval" }).click();
  await a.getByText("Sent to Mark for approval.").waitFor();
  await m.goto(`${VA}/content/${tRev}`);
  await m.getByRole("button", { name: "Approve and publish" }).click();
  await m.getByRole("alert").filter({ hasText: /needs its source and the client's permission/ }).waitFor();
  check("a testimonial without permission can't be published", sql(`select status from content_revisions where id = '${tRev}'`) === "submitted");
  await m.getByLabel("What needs to change").fill(`QA ${stamp}: add the source and confirm permission.`);
  await m.getByRole("button", { name: "Send back" }).click();
  await m.getByText("Sent back to the author.").waitFor();
  await a.goto(`${VA}/content`);
  check("the author sees the note", await a.getByText(`Note: QA ${stamp}: add the source and confirm permission.`).isVisible());

  // 4. The agent's own profile and photo.
  await a.goto(`${VA}/profile`);
  await axeAll(a, "/profile");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await a.setInputFiles("#photo", { name: "headshot.png", mimeType: "image/png", buffer: svg });
  await a.getByRole("button", { name: "Upload photo" }).click();
  await a.getByRole("alert").filter({ hasText: "Upload a JPEG, PNG or WebP photo." }).waitFor();
  check("an SVG renamed .png is refused", sql(`select coalesce(photo_path, '') from agent_profiles where slug = 'viv-kelvin'`) === "");
  // 1×1 PNG.
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201e221bc330000000049454e44ae426082", "hex");
  await a.setInputFiles("#photo", { name: "headshot.png", mimeType: "image/png", buffer: png });
  await a.getByRole("button", { name: "Upload photo" }).click();
  await a.getByText(/Photo updated\./).waitFor();
  const path = sql(`select photo_path from agent_profiles where slug = 'viv-kelvin'`);
  check("the photo is stored in the agent's own folder", path.startsWith(`${agent}/photo-`) && path.endsWith(".png"));
  check("the console shows the new photo", (await a.locator(`img[src$="${path}"]`).count()) === 1);
  check("the About page shows it", (await (await fetch(`${BASE}/about`)).text()).includes(`agent-photos/${path}`));
  await a.getByLabel("Bio").fill("Perfect for young families who want a broker.");
  await a.getByRole("button", { name: "Save profile" }).click();
  await a.getByRole("alert").filter({ hasText: /Reword before saving/ }).waitFor();
  await a.getByLabel("Bio").fill(`QA ${stamp}: fictional bio, twenty years on the Peninsula.`);
  await a.getByRole("button", { name: "Save profile" }).click();
  await a.getByText(/^Saved\./).waitFor();
  check("bio saved", sql(`select bio from agent_profiles where slug = 'viv-kelvin'`).startsWith(`QA ${stamp}`));
  await a.getByRole("button", { name: "Remove photo" }).click();
  await a.getByText(/^Photo removed\./).waitFor();
  check("photo removed from the profile and the bucket", sql(`select coalesce(photo_path, '') from agent_profiles where slug = 'viv-kelvin'`) === "" && sql(`select count(*) from storage.objects where name = '${path}'`) === "0");

  // 5. Featured listings.
  const pin = sql(`select listing_key from mls_listings where standard_status = 'Active' and not is_own_listing order by listing_key desc limit 1`);
  const sold = sql(`select listing_key from mls_listings where standard_status = 'Closed' limit 1`);
  await m.goto(`${VA}/featured`);
  await axeAll(m, "/featured");
  await m.getByLabel("MLS listing key").fill(sold);
  await m.getByRole("button", { name: "Pin listing" }).click();
  await m.getByRole("alert").filter({ hasText: "Only listings for sale can be featured." }).waitFor();
  await m.getByLabel("MLS listing key").fill(pin);
  await m.getByRole("button", { name: "Pin listing" }).click();
  await m.getByText(/Pinned\. The website is updated\./).waitFor();
  const home = await (await fetch(`${BASE}/`)).text();
  const section = home.slice(home.indexOf('aria-label="Featured listings"'));
  const firstHref = section.match(/href="\/listing\/([^"/?]+)/)?.[1];
  check("the pinned listing leads the home page", firstHref === pin, `first card ${firstHref}`);
  await m.getByRole("button", { name: /^Unpin/ }).click();
  await m.getByText(/Removed\./).waitFor();
  check("unpinned", sql(`select count(*) from featured_listings`) === "0");
} finally {
  const [pid, photo, pub] = vivBefore.split("|");
  sql(`update agent_profiles set profile_id = ${pid ? `'${pid}'` : "null"}, photo_path = ${photo ? `'${photo}'` : "null"}, published = ${pub === "t"} where slug = 'viv-kelvin'`);
  sql(`delete from featured_listings`);
  await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } }).catch(() => {});
}

await browser.close();
done();
