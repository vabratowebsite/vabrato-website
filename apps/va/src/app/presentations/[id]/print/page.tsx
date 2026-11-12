import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/print-button";
import { KIND_TITLE, VABRATO_SERVICES, cleanParts, sections, type KitKind } from "@/lib/kit-parts";
import { typicalTimeline } from "@/lib/kits";
import { PRINT_CSS } from "@/lib/print";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// The printable presentation (S6b PR 5): the approved pages, then the agent's
// card, Vabrato's services and the usual timeline, all from our records. A
// presentation that isn't approved can't be printed.
export const dynamic = "force-dynamic";

export default async function PresentationPrint({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from("ai_drafts").select("id, kind, status, content, owner_id").eq("id", id).in("kind", ["listing_presentation", "buyer_presentation"]).maybeSingle();
  if (!p || p.status !== "approved") notFound();
  const kind = p.kind as KitKind;
  const parts = cleanParts(kind, p.content);
  const { data: agent } = await supabase.from("agent_profiles").select("display_name, title, bio, phone, email, license_number").eq("profile_id", p.owner_id).maybeSingle();

  return (
    <main id="main" className="mx-auto max-w-[8.5in] bg-white p-8 font-body text-ink">
      <style>{PRINT_CSS}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-no-print>
        <a href={`/presentations/${p.id}`} className="font-body text-body-sm text-navy underline">
          ← Back to the presentation
        </a>
        <PrintButton />
      </div>
      <article aria-label={KIND_TITLE[kind]}>
        <section className="print-page space-y-4">
          <p className="text-label uppercase tracking-label text-gold-ink">Vabrato Real Estate Services · {KIND_TITLE[kind]}</p>
          <h1 className="font-display text-[34px] leading-tight text-navy">{parts.title}</h1>
          {sections(parts).map((s, i) => (
            <section key={i} className="space-y-2" aria-label={s.heading || `Section ${i + 1}`}>
              {s.heading && <h2 className="font-display text-[22px] text-navy">{s.heading}</h2>}
              {s.paragraphs.map((para, j) => (
                <p key={j} className="text-body-md leading-relaxed">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </section>
        <section className="print-page mt-10 space-y-6" aria-label="About us">
          <div>
            <h2 className="font-display text-[22px] text-navy">Your agent</h2>
            <p className="mt-2 text-body-md font-medium">
              {agent?.display_name ?? profile.full_name}
              {agent?.title ? `, ${agent.title}` : ""}
            </p>
            {agent?.bio && <p className="mt-1 whitespace-pre-wrap text-body-md">{agent.bio}</p>}
            <p className="mt-1 text-body-sm">
              {[agent?.phone, agent?.email].filter(Boolean).join(" · ")}
              {agent?.license_number ? ` · DRE ${agent.license_number}` : ""}
            </p>
          </div>
          <div>
            <h2 className="font-display text-[22px] text-navy">How Vabrato works for you</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-body-md">
              {VABRATO_SERVICES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-[22px] text-navy">A typical escrow</h2>
            <p className="mt-1 text-body-sm text-muted">Days after the offer is accepted, on our usual terms. Your contract sets the actual dates.</p>
            <ol className="mt-2 space-y-1 text-body-md">
              {typicalTimeline().map((m) => (
                <li key={`${m.day}-${m.label}`}>
                  <span className="font-medium">Day {m.day}:</span> {m.label}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-body-sm text-muted">Vabrato Real Estate Services. Equal Housing Opportunity.</p>
        </section>
      </article>
    </main>
  );
}
