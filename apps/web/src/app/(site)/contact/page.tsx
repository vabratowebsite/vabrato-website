import { SectionTitle } from "@vabrato/ui/web";
import { LeadForm } from "@/components/forms/LeadForm";
import { SelectField, TextArea } from "@/components/forms/fields";
import { ORG, ORG_ADDRESS_LINE } from "@/lib/org";
import { listAgents } from "@/lib/public/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact Vabrato Real Estate Services",
  description: "Call, visit or send a message to Vabrato Real Estate Services in San Carlos, CA.",
  path: "/contact",
});

const TOPICS = [
  ["buying", "Buying a home"],
  ["selling", "Selling a home"],
  ["home-value", "Home value"],
  ["transform", "Pre-sale renovation"],
  ["call", "Book a call"],
  ["other", "Something else"],
] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactPage({ searchParams }: Props) {
  const sp = await searchParams;
  const agents = await listAgents();
  const agent = agents.find((a) => a.slug === sp.agent);
  const topic = TOPICS.some(([v]) => v === sp.topic) ? String(sp.topic) : "buying";
  return (
    <div className="mx-auto grid max-w-site gap-12 px-4 py-12 md:grid-cols-[1fr_1.3fr] md:px-6">
      <div className="space-y-6">
        <SectionTitle as="h1" title="Contact us" hairline={false} />
        <address className="not-italic font-body text-body text-ink">
          {ORG.name}
          <br />
          {ORG_ADDRESS_LINE}
        </address>
        <ul className="font-body text-body text-ink">
          {ORG.phones.map((p) => (
            <li key={p.number}>
              {p.label}:{" "}
              <a href={`tel:${p.number.replace(/[^\d+]/g, "")}`} className="text-navy underline">
                {p.number}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <section aria-labelledby="contact-form">
        <h2 id="contact-form" className="mb-4 font-subhead text-subhead-lg text-ink">
          {agent ? `Send ${agent.display_name} a message` : "Send us a message"}
        </h2>
        <LeadForm kind="contact" submitLabel="Send message">
          {agent && <input type="hidden" name="agent" value={agent.slug} />}
          <SelectField label="I'm interested in" name="topic" defaultValue={topic}>
            {TOPICS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextArea label="Message" name="message" />
        </LeadForm>
      </section>
    </div>
  );
}
