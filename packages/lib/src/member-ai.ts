// Ask Vabrato, the member assistant in /my (S5b). The member features, in the
// order shown: the website uses the list for its menu and buttons, the console
// for its switches, so the names can't drift. Each has its own switch
// (feature_flags, 0036 onward) on top of the master switch ai_enabled.
// No model code here.

export interface MemberAiFeature {
  /** feature_flags.key; the pipeline's feature key is the same without "ai_". */
  flag: `ai_member_${string}`;
  /** The button in /my/assistant. */
  name: string;
  /** For admins, on the console's /assistant page. */
  what: string;
  /** Sends MLS listing data: needs the MLSListings approval switch (MLS_AI_GATE) too (0039). */
  needsMlsApproval?: true;
}

/**
 * Admins turn this on only once MLSListings has approved AI on listing data
 * in writing. While it's off, the database refuses to switch on any feature
 * with needsMlsApproval, and turning it off turns them off (0039).
 */
export const MLS_AI_GATE = "ai_mls_approved";

export const MEMBER_AI_FEATURES: MemberAiFeature[] = [
  {
    flag: "ai_member_explain",
    name: "Explain a term",
    what: "Explains a real-estate term in plain language (escrow, contingency, disclosures and the like). Not legal or tax advice; the member can pass the question to their agent. Nothing is kept.",
  },
  {
    flag: "ai_member_search",
    name: "Search by sentence",
    what: "Turns a sentence (\"3-bed house in San Carlos under $2.5M\") into the website's normal search filters. The member sees the filters and runs or saves the search themselves. Nothing is kept.",
  },
  {
    flag: "ai_member_summarize",
    name: "Summarize a document",
    what: "Summarizes one of the member's documents (their uploads, or files their agent shared; 50 pages at most) with page references, and suggests questions and to-dos. The summary isn't kept. To-dos the member adds wait for their agent's approval on the member's page here.",
  },
  {
    flag: "ai_member_draft",
    name: "Draft an email or message",
    what: "Drafts an email or message for the member to their movers, a contractor, their lender, their agent or someone else. Only the home's address (and a sale's closing date) goes with their notes. The member edits and sends it themselves; AI never sends. Saved drafts are private to the member (not shown here) and deleted 30 days after the last edit.",
  },
  {
    flag: "ai_member_cover_letter",
    name: "Offer cover letter",
    what: "For buyers: a cover letter about the offer's terms only (price, timing, flexibility, preapproval). Notes about the buyer's family, background, faith, age or health are refused (Fair Housing). The letter goes to the agent only, as a portal message the member sends.",
  },
  {
    flag: "ai_member_compare",
    name: "Compare homes",
    what: "Compares 2 to 4 of the member's saved homes from the listing fields they may see (IDX, or VOW once accepted): differences and questions for their agent. No price opinions. Homes whose sellers opted out of automated valuations or comments are never sent. Needs the MLSListings approval switch. Nothing is kept.",
    needsMlsApproval: true,
  },
  {
    flag: "ai_member_listing",
    name: "Ask about a home",
    what: "Answers a member's question about one home from the listing fields they may see, naming the fields it used. No price opinions; anything the listing doesn't say goes to their agent. Opted-out homes are never sent. Needs the MLSListings approval switch. Nothing is kept.",
    needsMlsApproval: true,
  },
  {
    flag: "ai_member_moving",
    name: "Moving plan",
    what: "A moving plan with dated steps. A seller's plan counts from their sale's closing date in the schedule engine (never changed, \"confirm with your agent\"); a buyer types their move date. Only that date, buyer or seller, and the member's notes are sent. Steps the member adds go to their to-dos for their agent's approval; they can download a calendar file. The plan isn't kept.",
  },
  {
    flag: "ai_member_prelisting",
    name: "Pre-listing checklist",
    what: "For sellers: a checklist counted back from a list date they type (repairs, cleaning, staging, photos, paperwork with their agent). No cost estimates or price opinions. Items the member adds go to their to-dos for their agent's approval. The checklist isn't kept.",
  },
  {
    flag: "ai_member_tour",
    name: "Plan a tour day",
    what: "For buyers: our code orders 2 to 6 saved homes (open houses first, then straight-line distance); the assistant adds what to look at in each from the listing fields they may see. Opted-out homes are never sent. Needs the MLSListings approval switch. Nothing is kept.",
    needsMlsApproval: true,
  },
  {
    flag: "ai_member_palette",
    name: "Colors and moodboard",
    what: "A color palette and a moodboard from the member's notes about a room or a style. The assistant picks the colors and names; our code checks them and draws the swatches. Labelled an AI concept for planning only. Nothing is kept.",
  },
  {
    flag: "ai_member_staging",
    name: "Staging ideas",
    what: "For sellers: ideas for staging a room they describe in words (no photos are sent): what to keep, remove, add and how to arrange it, with a few accent colors. No costs or price opinions. Ideas the member adds go to their to-dos for their agent's approval. Nothing else is kept.",
  },
  {
    flag: "ai_member_flyer",
    name: "Open-house flyer and posts",
    what: "For sellers: a headline, highlights, a short description and Instagram and Facebook posts, written only from the seller's own words (no listing data is sent). The seller sends it to their agent, who approves it here on the member's page and picks our listing and open house; the flyer's facts, photo and agent card then come from our records.",
  },
];

/** The pipeline's feature key for a member switch ("ai_member_explain" → "member_explain"). */
export const memberFeatureKey = (flag: MemberAiFeature["flag"]) => flag.slice(3) as `member_${string}`;
