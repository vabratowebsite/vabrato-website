import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/print-button";
import { bullets, cleanParts } from "@/lib/kit-parts";
import { PRINT_CSS, listingPhotoUrl } from "@/lib/print";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// The printable flyer for an approved launch kit (S6b PR 5). The facts
// (address, price, rooms, size, photo, the agent's name and phone) come from
// our records; only the headline, highlights and short description are the
// approved kit's words. A kit that isn't approved has no flyer.
export const dynamic = "force-dynamic";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function FlyerPage({ params }: { params: Promise<{ key: string; id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { key: raw, id } = await params;
  const key = decodeURIComponent(raw);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9._-]{1,64}$/.test(key)) notFound();
  const supabase = await supabaseServer();
  const { data: kit } = await supabase.from("ai_drafts").select("id, owner_id, status, content, listing_key").eq("id", id).eq("kind", "listing_kit").maybeSingle();
  if (!kit || kit.status !== "approved" || kit.listing_key !== key) notFound();
  const [{ data: listing }, { data: media }, { data: agent }] = await Promise.all([
    supabase.from("mls_listings").select("list_price, city, bedrooms_total, bathrooms_total, living_area, address_display, data, is_own_listing").eq("listing_key", key).maybeSingle(),
    supabase.from("mls_media").select("url, storage_path").eq("listing_key", key).order("sort_order").limit(1),
    supabase.from("agent_profiles").select("display_name, title, phone, email, license_number").eq("profile_id", kit.owner_id).maybeSingle(),
  ]);
  if (!listing?.is_own_listing) notFound();
  const parts = cleanParts("listing_kit", kit.content);
  const d = (listing.data ?? {}) as Record<string, unknown>;
  const address = listing.address_display && typeof d.UnparsedAddress === "string" ? d.UnparsedAddress : (listing.city ?? "");
  const photo = listingPhotoUrl(media?.[0]);
  const facts = [
    listing.list_price != null ? usd.format(Number(listing.list_price)) : null,
    listing.bedrooms_total != null ? `${listing.bedrooms_total} bedrooms` : null,
    listing.bathrooms_total != null ? `${listing.bathrooms_total} bathrooms` : null,
    listing.living_area ? `${Number(listing.living_area).toLocaleString("en-US")} sq ft` : null,
  ].filter(Boolean);

  return (
    <main id="main" className="mx-auto max-w-[8.5in] bg-white p-8 font-body text-ink">
      <style>{PRINT_CSS}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-no-print>
        <a href={`/listings/${encodeURIComponent(key)}/kit`} className="font-body text-body-sm text-navy underline">
          ← Back to the launch kit
        </a>
        <PrintButton />
      </div>
      <article className="space-y-5" aria-label="Flyer">
        <p className="text-label uppercase tracking-label text-gold-ink">Vabrato Real Estate Services · Just listed</p>
        <h1 className="font-display text-[36px] leading-tight text-navy">{parts.flyer_headline}</h1>
        <p className="text-body-md font-medium">{address}</p>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Front of ${address}`} className="aspect-[3/2] w-full object-cover" />
        ) : (
          <div className="flex aspect-[3/2] w-full items-center justify-center border border-line bg-navy-50 text-ink" role="img" aria-label="Listing photo not available">
            Listing photo
          </div>
        )}
        <p className="text-body-md font-medium">{facts.join(" · ")}</p>
        <ul className="list-disc space-y-1 pl-6 text-body-md">
          {bullets(parts.flyer_bullets).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
        <p className="text-body-md">{parts.flyer_blurb}</p>
        <footer className="mt-8 border-t border-line pt-4 text-body-sm">
          <p className="font-medium">{agent?.display_name ?? profile.full_name}{agent?.title ? `, ${agent.title}` : ""}</p>
          <p>
            {[agent?.phone, agent?.email].filter(Boolean).join(" · ")}
            {agent?.license_number ? ` · DRE ${agent.license_number}` : ""}
          </p>
          <p className="mt-2 text-muted">Vabrato Real Estate Services. Equal Housing Opportunity. Information deemed reliable but not guaranteed.</p>
        </footer>
      </article>
    </main>
  );
}
