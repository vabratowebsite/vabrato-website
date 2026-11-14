import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKLIST, MEMBER_AI_FEATURES, SELLER_TYPE_LABELS } from "@vabrato/lib";
import { MEMBER_MESSAGES } from "../member/assistant/ask";
import { DESIGN_MESSAGES } from "../member/assistant/design";
import { DRAFT_MESSAGES } from "../member/assistant/drafts";
import { FILE_MESSAGES } from "../member/assistant/files";
import { LISTING_MESSAGES } from "../member/assistant/listing-ask";
import { SCHEDULE_MESSAGES } from "../member/assistant/schedules";

// Mark's review sheet (S5b PR 7, owner answer 2026-11-14): every member-facing
// wording of Ask Vabrato in one place, plus his pending S6b sign-offs. Built
// from the code itself (message constants, the modes' hints, and the notes
// written in the pages, each checked against its file), so the sheet can't
// drift: wording-sheet.test.ts fails until docs/review/member-ai-wording.md is
// regenerated (UPDATE_WORDING=1). Not imported by the app.

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, "../..");
const REPO = resolve(WEB, "../..");
export const SHEET_PATH = resolve(REPO, "docs/review/member-ai-wording.md");

/** JSX text as a reader sees it: entities decoded, line breaks and indentation folded. */
export const plain = (s: string) =>
  s
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\{" "\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

/** Notes written straight into the pages: [where it shows, the file, the text]. Each must still be in its file. */
export const PAGE_NOTES: [string, string, string][] = [
  ["Ask Vabrato page (top)", "apps/web/src/app/my/assistant/page.tsx", "Answers are written by AI and can be wrong. Check anything important with your agent."],
  ["Ask Vabrato page (top)", "apps/web/src/app/my/assistant/page.tsx", "Nothing you type is kept unless you save a draft, add a to-do or send a flyer: leaving this page clears the rest. Your agent doesn't see your questions or drafts, only to-dos you add, flyers you send and messages you send them."],
  ["Ask Vabrato page (top)", "apps/web/src/app/my/assistant/page.tsx", "It never gives legal, tax or wiring advice. Always call your escrow officer to verify wiring instructions."],
  ["Ask Vabrato page, switched off", "apps/web/src/app/my/assistant/page.tsx", "Ask Vabrato, our assistant, isn't switched on yet. Your agent is happy to help in the meantime:"],
  ["Ask Vabrato page, daily limit 0", "apps/web/src/app/my/assistant/page.tsx", "Ask Vabrato isn't available on your account right now."],
  ["Explain a term (answer)", "apps/web/src/member/components/AskVabrato.tsx", "Written by AI and can be wrong. Not legal or tax advice: ask your agent about your own situation."],
  ["Search by sentence (answer)", "apps/web/src/member/components/AskVabrato.tsx", 'Check the filters before you run it. Nothing is saved: to get alerts, use "Save search" on the results.'],
  ["Summarize a document (answer)", "apps/web/src/member/components/AskVabrato.tsx", "Written by AI from your document and can be wrong. Not legal, engineering or tax advice. Your agent sees to-dos you add, not this summary."],
  ["Summarize a document (to-dos)", "apps/web/src/member/components/AskVabrato.tsx", "Tick the ones you want. Your agent sees and approves to-dos you add."],
  ["Offer cover letter (draft)", "apps/web/src/member/components/DraftEditor.tsx", "Your agent reviews it before it goes with your offer. Cover letters are about your offer only (Fair Housing)."],
  ["Compare homes and Ask about a home (answer)", "apps/web/src/member/components/ListingAnswers.tsx", "Written by AI from the listing and can be wrong. Not legal or tax advice, and not an appraisal or price opinion: ask your agent."],
  ["Compare page", "apps/web/src/member/components/CompareWithAskVabrato.tsx", "Uses only these homes' listing facts. Nothing is saved."],
  ["Moving plan and pre-listing checklist (answer)", "apps/web/src/member/components/PlanAnswers.tsx", "Written by AI and can be wrong. Not legal or tax advice. Dates from your sale come from your agent's schedule; confirm anything important with your agent."],
  ["Moving plan (dates of record)", "apps/web/src/member/components/PlanAnswers.tsx", "Ask Vabrato never changes these. Confirm them with your agent."],
  ["Moving plan and pre-listing checklist (dropped steps)", "apps/web/src/member/components/PlanAnswers.tsx", "Some suggestions were left out because they named contract dates, costs or price opinions. Your agent handles those."],
  ["Plan a tour day (answer)", "apps/web/src/member/components/PlanAnswers.tsx", "Order worked out by our code from open-house times and straight-line distance. Listing data: MLSListings."],
  ["Colors and moodboard (answer)", "apps/web/src/member/components/DesignAnswers.tsx", "AI concept for planning only. Screen colors vary: test a sample on the wall first. Listing photos must always show the real home."],
  ["Staging ideas (answer)", "apps/web/src/member/components/DesignAnswers.tsx", "Written by AI and can be wrong. Ideas for planning only: listing photos must show the real home. Check bigger changes with your agent."],
  ["Staging ideas (dropped ideas)", "apps/web/src/member/components/DesignAnswers.tsx", "Some ideas mentioned costs or value and were left out. Your agent can help with those."],
  ["Open-house flyer and posts (card)", "apps/web/src/member/components/DesignAnswers.tsx", "Written by AI from your words and can be wrong. Nothing is posted for you: once approved, you copy the posts and print the flyer yourself."],
  ["Open-house flyer and posts (sent)", "apps/web/src/member/components/DesignAnswers.tsx", "Sent to your agent. They approve it and add your listing, the open-house time and their details."],
  ["My flyers (approved flyer, posts)", "apps/web/src/app/my/flyers/[id]/page.tsx", "Approved by your agent. The brokerage line is added at the end. Post them yourself, with your own photos of the home."],
  ["Delete my assistant data (confirmation)", "apps/web/src/member/components/MemberTodos.tsx", "Delete your assistant data? Your saved drafts, your flyers, and to-dos waiting for your agent or declined are removed. Approved to-dos stay."],
];

/** The labels on AI output (packages/ui AILabels): mockup 11. */
const LABELS = ["AI draft", "AI draft · You send it", "Suggested", "AI concept"];

/** Each mode's button name and hint, read from the Ask Vabrato form. */
export function modeHints(): { label: string; field: string; hint: string }[] {
  const src = read("apps/web/src/member/components/AskVabrato.tsx");
  const block = src.slice(src.indexOf("const MODES"), src.indexOf("};", src.indexOf("const MODES")));
  const out: { label: string; field: string; hint: string }[] = [];
  for (const m of block.matchAll(/label: "([^"]+)",\s*field: "([^"]+)",\s*hint: "((?:[^"\\]|\\.)+)"/g)) out.push({ label: m[1]!, field: m[2]!, hint: m[3]!.replace(/\\"/g, '"') });
  return out;
}

/** The repair-response wording waiting for Mark (apps/va repair-kinds.ts, "confirm with Mark"). */
export function repairWording(): { name: string; text: string }[] {
  const src = read("apps/va/src/lib/repair-kinds.ts");
  const where: Record<string, string> = { REPAIR_WORDING: "Each item the seller will repair", FORM_GOVERNS: "Last line of the response" };
  return [...src.matchAll(/export const (\w+) = "([^"]+)";\s*\/\/ confirm with Mark/g)].map((m) => ({ name: m[1]!, where: where[m[1]!] ?? m[1]!, text: m[2]! }));
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const table = (rows: string[][], head: string[]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
// A message built from a number (a page count) is shown with an example value.
const messages = (o: Record<string, string | ((n: number) => string)>) =>
  table(
    Object.entries(o).map(([k, v]) => [`\`${k}\``, typeof v === "function" ? `${v(72)} (example: 72)` : v]),
    ["Key", "Wording"],
  );
const signOff = "Mark: ☐ keep as is  ☐ change (note below)";

export function buildWordingSheet(): string {
  const parts: string[] = [];
  parts.push(`# Ask Vabrato: member wording for Mark's review

Every message, label and note members see from Ask Vabrato, the assistant in /my, grouped by where it shows. Generated from the code (\`apps/web/src/review/wording-sheet.ts\`), so it matches what members see. Answers themselves are written by the model and checked by our code; they aren't listed here. No AI feature is switched on yet.

For each group, tick "keep" or write the change. Pending items from the staff assistant (S6b) are at the end.`);

  parts.push(`## 1. Labels on AI output

${LABELS.map((l) => `- ${l}`).join("\n")}

${signOff}`);

  const byWhere = new Map<string, string[]>();
  for (const [where, , text] of PAGE_NOTES) byWhere.set(where, [...(byWhere.get(where) ?? []), text]);
  parts.push(`## 2. Notes on the pages and answer cards

${table(
    [...byWhere.entries()].map(([where, texts]) => [where, texts.join(" / ")]),
    ["Where", "Wording"],
  )}

${signOff}`);

  parts.push(`## 3. The modes: buttons, field names and hints

${table(
    modeHints().map((m) => [m.label, m.field, m.hint]),
    ["Mode", "Field", "Hint under the field"],
  )}

${signOff}`);

  parts.push(`## 4. When Ask Vabrato can't answer

General (any mode):

${messages(MEMBER_MESSAGES)}

Documents:

${messages(FILE_MESSAGES)}

Drafts and cover letters:

${messages(DRAFT_MESSAGES)}

Compare and listing questions:

${messages(LISTING_MESSAGES)}

Moving plans, checklists and tour days:

${messages(SCHEDULE_MESSAGES)}

Colors, staging, flyers:

${messages(DESIGN_MESSAGES)}

${signOff}`);

  parts.push(`## 5. What each switch does (shown to admins on the console's Assistant page)

${table(
    MEMBER_AI_FEATURES.map((f) => [f.name, f.what, f.needsMlsApproval ? "Yes" : "No"]),
    ["Feature", "What it does", "Needs MLSListings approval"],
  )}

${signOff}`);

  const confirmRows = CHECKLIST.filter((c) => c.confirm);
  parts.push(`## 6. Pending from the staff assistant (S6b)

### 6a. Fair Housing wording list (S6b PR 9)

Blocked in anything the assistant writes or a member types (familial status): "no kids", "no children", "without kids", "adults only", "perfect for families", "no families", "no families with kids", "without families", "not for families", "not suitable / suited / ideal / good / great / safe / right / meant / intended for kids / children / families", "children / kids / families (are) not allowed / permitted / welcome", "no young children".

Allowed: "family room", "no family room", "kids' bedroom", "no children's play structure", "children's play area in the park nearby", "the seller's children will move the furniture", "single-family home", "55+ community" (housing for older persons is a lawful exemption).

${signOff}

### 6b. Seller-type checklist rows marked "(confirm)" (S6b PR 7a)

${table(
    confirmRows.map((c) => [c.label, c.sellerTypes.length === Object.keys(SELLER_TYPE_LABELS).length ? "all" : c.sellerTypes.map((t) => SELLER_TYPE_LABELS[t]).join(", "), c.hint ?? "", c.ifApplies ? "If it applies" : "Required"]),
    ["Document", "Seller types", "Note shown", "Kind"],
  )}

Mark: for each row ☐ keep  ☐ drop

### 6c. Repair-response wording (S6b PR 7b)

${table(
    repairWording().map((r) => [r.where, r.text]),
    ["Where", "Wording"],
  )}

${signOff}`);

  parts.push(`---

Signed: ____________________  Date: ____________`);
  return `${parts.join("\n\n")}\n`;
}
