import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/print-button";
import { KIND_TITLE, VABRATO_SERVICES, cleanParts, sections, type KitKind } from "@/lib/kit-parts";
import { typicalTimeline } from "@/lib/kits";
import { PRINT_CSS } from "@/lib/print";
import type { CmaSubject } from "@/lib/cma";
import { cmaRange, fmtMoney } from "@/lib/stats";
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

  // An attached CMA (S6b PR 6): our range and comparables, and the approved summary. Only while CMAs are on.
  const cmaId = typeof (p.content as Record<string, unknown> | null)?.cma_id === "string" ? String((p.content as Record<string, unknown>).cma_id) : null;
  let cmaSection: { range: ReturnType<typeof cmaRange>; comps: { listing_key: string; street: string | null; city: string | null; close_price: number | null; close_date: string | null; living_area: number | null; price_per_sqft: number | null }[]; summary: string[] } | null = null;
  if (cmaId) {
    const [{ data: flag }, { data: cma }, { data: writeup }] = await Promise.all([
      supabase.from("feature_flags").select("enabled").eq("key", "cma_enabled").maybeSingle(),
      supabase.from("cmas").select("subject, comp_keys").eq("id", cmaId).maybeSingle(),
      supabase.from("ai_drafts").select("content").eq("kind", "cma_writeup").eq("cma_id", cmaId).eq("status", "approved").order("approved_at", { ascending: false }).limit(1),
    ]);
    if (flag?.enabled && cma && writeup?.length) {
      const { data: comps } = cma.comp_keys.length ? await supabase.rpc("cma_comps", { p_keys: cma.comp_keys }) : { data: [] };
      const subject = cma.subject as unknown as CmaSubject;
      const w = cleanParts("cma_writeup", writeup[0]!.content);
      cmaSection = { range: cmaRange(comps ?? [], subject.sqft ?? null), comps: comps ?? [], summary: (w.summary ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) };
    }
  }

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
        {cmaSection && (
          <section className="print-page mt-10 space-y-4" aria-label="Recent comparable sales">
            <h2 className="font-display text-[22px] text-navy">Recent comparable sales</h2>
            {cmaSection.range ? (
              <p className="text-body-md">
                <span className="font-medium">
                  {fmtMoney(cmaSection.range.low)} – {fmtMoney(cmaSection.range.high)}
                </span>{" "}
                (midpoint {fmtMoney(cmaSection.range.mid)}; median {fmtMoney(cmaSection.range.medianPpsf)}/sq ft from {cmaSection.range.comps} sales)
              </p>
            ) : (
              <p className="text-body-md">No range: it needs the home&apos;s size and at least 3 comparables with a known size.</p>
            )}
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-1 pr-3 font-medium">Address</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Sold</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Sq ft</th>
                  <th scope="col" className="py-1 text-right font-medium">$/sq ft</th>
                </tr>
              </thead>
              <tbody>
                {cmaSection.comps.map((c) => (
                  <tr key={c.listing_key} className="border-b border-line">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {c.street ?? "Address withheld"}, {c.city}
                    </th>
                    <td className="py-1 pr-3 text-right">{fmtMoney(c.close_price)}</td>
                    <td className="py-1 pr-3">{c.close_date}</td>
                    <td className="py-1 pr-3 text-right">{c.living_area ? Number(c.living_area).toLocaleString("en-US") : "—"}</td>
                    <td className="py-1 text-right">{fmtMoney(c.price_per_sqft)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cmaSection.summary.map((para, i) => (
              <p key={i} className="text-body-md leading-relaxed">
                {para}
              </p>
            ))}
            <p className="border-l-4 border-gold bg-gold-50 p-3 text-body-sm">This is a comparison of recent sales prepared by a real estate broker. It is not an appraisal and should not be relied on as one. Based on MLSListings data.</p>
          </section>
        )}
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
