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
}

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
];

/** The pipeline's feature key for a member switch ("ai_member_explain" → "member_explain"). */
export const memberFeatureKey = (flag: MemberAiFeature["flag"]) => flag.slice(3) as `member_${string}`;
