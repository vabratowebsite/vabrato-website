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
];

/** The pipeline's feature key for a member switch ("ai_member_explain" → "member_explain"). */
export const memberFeatureKey = (flag: MemberAiFeature["flag"]) => flag.slice(3) as `member_${string}`;
