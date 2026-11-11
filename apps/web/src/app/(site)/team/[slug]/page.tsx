import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHero, FAQAccordion, ListingPhotoPlaceholder, SectionTitle, SkillList, VideoThumb } from "@vabrato/ui/web";
import { LeadForm } from "@/components/forms/LeadForm";
import { SelectField, TextArea } from "@/components/forms/fields";
import { AgentPhoto } from "@/components/AgentPhoto";
import { JsonLd } from "@/components/JsonLd";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { getAgent } from "@/lib/public/content";
import { listingsByAgent, mlsLastUpdated } from "@/lib/public/listings";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, personJsonLd } from "@/lib/seo";

// Agent profile (mockups 09/10). License number next to the contact details
// (review item 2). Listings by agent ID; sales and live stats stay hidden
// until public_sold / public_stats are confirmed (MLS-10). No review markup.
export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const agent = await getAgent((await params).slug);
  if (!agent) return { title: "Agent not found | Vabrato" };
  return pageMetadata({
    title: `${agent.display_name}, ${agent.title} | Vabrato Real Estate Services`,
    description: `${agent.display_name} is a ${agent.title.toLowerCase()} with Vabrato Real Estate Services in San Carlos, CA.`,
    path: `/team/${agent.slug}`,
  });
}

export default async function AgentPage({ params }: Props) {
  const agent = await getAgent((await params).slug);
  if (!agent) notFound();
  const [first, ...rest] = agent.display_name.split(" ");
  const listings = agent.mls_member_id ? await listingsByAgent(agent.mls_member_id) : [];
  const lastUpdated = listings.length ? await mlsLastUpdated() : null;
  const path = `/team/${agent.slug}`;
  const licenses = [agent.license_number ? `CA DRE #${agent.license_number}` : "DRE license # (to be added)"];

  return (
    <>
      <AgentHero
        photo={<AgentPhoto name={agent.display_name} path={agent.photo_path} eager />}
        firstName={first ?? agent.display_name}
        lastName={rest.join(" ")}
        title={agent.title}
        licenses={licenses}
        phone={agent.phone ?? undefined}
        email={agent.email ?? undefined}
        social={agent.social_links}
        bookHref={`/contact?agent=${agent.slug}&topic=call`}
        contactHref="#contact"
      />

      <div className="mx-auto max-w-site space-y-14 px-4 py-10 md:px-6">
        {agent.bio && (
          <section aria-labelledby="bio">
            <h2 id="bio" className="mb-3 font-subhead text-subhead-lg text-ink">
              About {first}
            </h2>
            <p className="max-w-prose whitespace-pre-line font-body text-body text-ink">{agent.bio}</p>
          </section>
        )}

        {(agent.skills.length > 0 || agent.outlook) && (
          <div className="grid gap-10 md:grid-cols-2">
            {agent.skills.length > 0 && <SkillList title="Skills" items={agent.skills} />}
            {agent.outlook && (
              <section aria-labelledby="outlook">
                <h2 id="outlook" className="mb-3 font-subhead text-subhead-md text-ink">
                  Outlook
                </h2>
                <p className="font-body text-body text-ink">{agent.outlook}</p>
              </section>
            )}
          </div>
        )}

        {agent.history && (
          <section aria-labelledby="history">
            <h2 id="history" className="mb-3 font-subhead text-subhead-lg text-ink">
              History
            </h2>
            <p className="max-w-prose whitespace-pre-line font-body text-body text-ink">{agent.history}</p>
          </section>
        )}

        {agent.video_youtube_id && (
          <section aria-label={`Video: ${agent.display_name}`} className="max-w-3xl">
            <VideoThumb poster={<ListingPhotoPlaceholder tint="slate" label="Video still" />} youtubeUrl={`https://www.youtube.com/watch?v=${agent.video_youtube_id}`} title={`Watch: ${agent.display_name}`} />
          </section>
        )}

        {listings.length > 0 && (
          <section aria-label={`Listings by ${agent.display_name}`}>
            <SectionTitle title={`${first}'s listings`} />
            <ResultsGrid rows={listings} />
            <div className="mt-6">
              <MlsAttribution lastUpdated={lastUpdated} />
            </div>
          </section>
        )}

        {agent.faq.length > 0 && (
          <section aria-labelledby="ask" className="grid gap-8 md:grid-cols-[1fr_2fr]">
            <h2 id="ask" className="font-display text-display-sm uppercase text-navy">
              Ask {first}
            </h2>
            <FAQAccordion items={agent.faq.map((f) => ({ question: f.q, answer: f.a }))} jsonLd={false} />
          </section>
        )}

        <section id="contact" aria-labelledby="contact-heading" className="grid gap-8 md:grid-cols-[1fr_2fr]">
          <h2 id="contact-heading" className="font-display text-display-sm uppercase text-navy">
            Send {first} a message
          </h2>
          <LeadForm kind="contact" submitLabel={`Send to ${first}`}>
            <input type="hidden" name="agent" value={agent.slug} />
            <SelectField label="I'm interested in" name="topic" defaultValue="buying">
              <option value="buying">Buying</option>
              <option value="selling">Selling</option>
              <option value="home-value">Home value</option>
              <option value="other">Something else</option>
            </SelectField>
            <TextArea label="Message" name="message" />
          </LeadForm>
        </section>
      </div>

      <JsonLd data={personJsonLd({ name: agent.display_name, title: agent.title, path })} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }, { name: agent.display_name, path }])} />
      {agent.faq.length > 0 && <JsonLd data={faqJsonLd(agent.faq)} />}
    </>
  );
}
