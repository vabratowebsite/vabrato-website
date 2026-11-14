import { AIDraftLabel } from "@vabrato/ui/web";
import { askMyAgentHref, type AskCard } from "../assistant/kinds";

// Answer cards for "Compare homes" and "Ask about a home" (S5b PR 4). Labelled
// as AI, with the listing data's source and each home's listing broker (MLS
// attribution), "not legal or tax advice; not an appraisal", and "Ask my
// agent". No model code; used by Ask Vabrato and the compare page.

type CompareCard = Extract<AskCard, { kind: "compare" }>;
type ListingCard = Extract<AskCard, { kind: "listing" }>;

const linkBtn =
  "inline-flex min-h-[44px] items-center justify-center px-4 font-body text-label font-medium uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

const DISCLAIMER = "Written by AI from the listing and can be wrong. Not legal or tax advice, and not an appraisal or price opinion: ask your agent.";

export function CompareAnswer({ card, heading }: { card: CompareCard; heading: React.ReactNode }) {
  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel />
      {heading}
      <ul className="space-y-1 text-caption text-muted">
        {card.homes.map((h) => (
          <li key={h.key}>
            <span className="font-medium text-ink">Home {h.letter}:</span> {h.label}
            {h.broker ? ` · Listing broker: ${h.broker}` : ""}
          </li>
        ))}
      </ul>
      {card.summary.length > 0 && (
        <div className="space-y-2">
          {card.summary.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      )}
      {card.differences.length > 0 && (
        <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="How the homes differ (scrolls sideways on small screens)">
          <table className="w-full min-w-[480px] border border-line bg-white text-left">
            <caption className="sr-only">How the homes differ</caption>
            <thead>
              <tr className="border-b border-line">
                <td className="px-3 py-2" />
                {card.homes.map((h) => (
                  <th key={h.key} scope="col" className="px-3 py-2 font-medium">
                    Home {h.letter}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.differences.map((d) => (
                <tr key={d.topic} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-medium text-muted">
                    {d.topic}
                  </th>
                  {d.values.map((v, i) => (
                    <td key={i} className="px-3 py-2 align-top">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {card.excluded.length > 0 && (
        <p className="border-l-4 border-gold bg-white px-3 py-2">
          Not included: {card.excluded.map((h) => h.label).join(", ")}. The seller asked that the listing not be used by AI tools, so it&apos;s compared on facts only in the table above it. Your agent can help.
        </p>
      )}
      {card.questions.length > 0 && (
        <section className="space-y-2" aria-label="Questions to ask your agent">
          <h3 className="font-medium">Questions to ask your agent</h3>
          <ul className="space-y-2">
            {card.questions.map((q, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>{q}</span>
                <a href={askMyAgentHref(q)} className="inline-flex min-h-[44px] items-center px-2 text-navy underline">
                  Ask my agent<span className="sr-only">: {q}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-caption text-muted">Listing data: MLSListings. {DISCLAIMER}</p>
    </div>
  );
}

export function ListingAnswer({ card, heading }: { card: ListingCard; heading: React.ReactNode }) {
  return (
    <div className="space-y-4 border border-line bg-soft p-4 font-body text-body-sm text-ink sm:p-6">
      <AIDraftLabel />
      {heading}
      <p className="text-caption text-muted">
        {card.home.label}
        {card.home.broker ? ` · Listing broker: ${card.home.broker}` : ""}
      </p>
      <p className="text-body">{card.answer}</p>
      {card.sources.length > 0 && (
        <p className="text-caption text-muted">
          From the listing: {card.sources.join(", ")}.
        </p>
      )}
      {card.notInListing && <p className="border-l-4 border-gold bg-white px-3 py-2">The listing doesn&apos;t say. Your agent can find out.</p>}
      <a href={askMyAgentHref(card.question)} className={`${linkBtn} border border-navy bg-white text-navy hover:bg-navy-50`}>
        Ask my agent
      </a>
      <p className="text-caption text-muted">Listing data: MLSListings. {DISCLAIMER}</p>
    </div>
  );
}
