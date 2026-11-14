import { notFound } from "next/navigation";
import Link from "next/link";
import { EqualHousingIcon, Panel } from "@vabrato/ui/web";
import { MemberShell } from "@/member/components/MemberShell";
import { CopyPost, PostGraphicDownload, PrintFlyer } from "@/member/components/FlyerTools";
import { BROKERAGE_LINE, FLYER_STATUS, flyerFacts, getFlyer, kindLabel, postWithBrokerage } from "@/member/flyers";
import { ORG } from "@/lib/org";
import { sells } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// An approved flyer (S5b PR 6). The words are the seller's, approved by their
// agent; the address, price, rooms, photo, open-house time and agent card come
// from our records, never the assistant. Printed from the browser.

const PRINT_CSS = `@media print {
  aside, header, nav, footer, [data-no-print] { display: none !important; }
  body, main { background: #fff !important; }
  [data-flyer] { border: none !important; padding: 0 !important; }
}`;

export default async function FlyerPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requirePortalMember("/my/flyers");
  if (!sells(member.role)) notFound();
  const { id } = await params;
  const f = await getFlyer(member.supabase, member.profile.id, id);
  if (!f) notFound();
  const facts = await flyerFacts(member.supabase, f, member.profile.agent_id);

  return (
    <MemberShell member={member} role={member.role} current="flyers" eyebrow="My flyers" title={f.headline}>
      <style>{PRINT_CSS}</style>
      <p data-no-print className="font-body text-body-sm">
        <Link href="/my/flyers" className="text-navy underline">
          ← My flyers
        </Link>
      </p>
      {f.status !== "approved" ? (
        <Panel title={FLYER_STATUS[f.status]}>
          <p className="font-body text-body text-ink">
            {f.status === "pending" ? "Your agent hasn't approved this flyer yet. It prints once they have." : "Your agent didn't approve this flyer. See their note on My flyers."}
          </p>
        </Panel>
      ) : !facts ? (
        <Panel title="This listing is no longer active">
          <p className="font-body text-body text-ink">The listing this flyer was approved for isn&apos;t active any more, so the flyer can&apos;t be shown. Your agent can help.</p>
        </Panel>
      ) : (
        <>
          <div data-no-print className="flex flex-wrap gap-2">
            <PrintFlyer />
          </div>
          <article data-flyer aria-label="Flyer" className="mx-auto max-w-[8.5in] space-y-5 border border-line bg-white p-6 font-body text-ink sm:p-8">
            <p className="text-label uppercase tracking-label text-gold-ink">
              {ORG.name} · {kindLabel(f.kind)}
            </p>
            <h2 className="font-display text-[32px] leading-tight text-navy sm:text-[36px]">{f.headline}</h2>
            <p className="text-body-md font-medium">{facts.address}</p>
            {facts.when && <p className="border-l-4 border-gold pl-3 text-body-md font-medium text-navy">Open house: {facts.when}</p>}
            {facts.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={facts.photo} alt={`Front of ${facts.address}`} className="aspect-[3/2] w-full object-cover" />
            ) : (
              <div className="flex aspect-[3/2] w-full items-center justify-center border border-line bg-navy-50 text-ink" role="img" aria-label="Listing photo not available">
                LISTING PHOTO (FROM MLS FEED)
              </div>
            )}
            <p className="text-body-md">{[facts.price, ...facts.facts].filter(Boolean).join(" · ")}</p>
            {f.highlights.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-body">
                {f.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            {f.blurb && <p className="whitespace-pre-wrap text-body">{f.blurb}</p>}
            <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4 text-body-sm">
              {facts.agent ? (
                <div>
                  <p className="font-medium">{facts.agent.name}</p>
                  {facts.agent.title && <p>{facts.agent.title}</p>}
                  {facts.agent.phone && <p>{facts.agent.phone}</p>}
                  {facts.agent.email && <p>{facts.agent.email}</p>}
                  {facts.agent.dre && <p>DRE #{facts.agent.dre}</p>}
                </div>
              ) : (
                <p>Contact your Vabrato agent.</p>
              )}
              <div className="text-right">
                <p>{BROKERAGE_LINE}</p>
                <p className="inline-flex items-center gap-1">
                  <span aria-hidden="true">
                    <EqualHousingIcon size={16} />
                  </span>{" "}
                  Equal Housing Opportunity
                </p>
              </div>
            </footer>
          </article>

          <section data-no-print aria-labelledby="posts" className="space-y-4 border border-line bg-white p-4 font-body text-body-sm text-ink sm:p-6">
            <h2 id="posts" className="font-subhead text-subhead-sm text-ink">
              Posts
            </h2>
            <p className="text-caption text-muted">Approved by your agent. The brokerage line is added at the end. Post them yourself, with your own photos of the home.</p>
            {[
              ["Instagram", f.instagram],
              ["Facebook", f.facebook],
            ]
              .filter(([, t]) => t)
              .map(([label, text]) => (
                <div key={label} className="space-y-2">
                  <h3 className="font-medium">{label}</h3>
                  <p className="whitespace-pre-wrap border border-line bg-soft p-3">{postWithBrokerage(text!)}</p>
                  <CopyPost label={label!} text={postWithBrokerage(text!)} />
                </div>
              ))}
            <h3 className="font-medium">Post image</h3>
            <PostGraphicDownload graphic={{ kind: f.kind, city: facts.city, when: facts.when, brokerage: BROKERAGE_LINE }} file={`${f.kind === "open_house" ? "open-house" : "just-listed"}.png`} />
          </section>
        </>
      )}
    </MemberShell>
  );
}
