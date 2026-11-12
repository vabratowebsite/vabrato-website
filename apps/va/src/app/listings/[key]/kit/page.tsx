import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { KitPanel } from "@/components/kit-editor";
import { mutedCls } from "@/components/ui";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { cleanParts } from "@/lib/kit-parts";
import type { KitView } from "@/lib/kit-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Launch kit for one of our own listings (S6b PR 5): the assistant writes the
// MLS description, social posts, email blast and flyer text; the agent edits
// and approves them, then copies or prints. Nothing is posted or sent.
export const dynamic = "force-dynamic";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function LaunchKitPage({ params }: { params: Promise<{ key: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(key)) notFound();
  const supabase = await supabaseServer();
  const ai = await aiFeaturesOn(supabase, ["ai_staff_listing_kit"]);
  const { data: listing } = await supabase.from("mls_listings").select("listing_key, is_own_listing, list_price, city, bedrooms_total, bathrooms_total, data").eq("listing_key", key).maybeSingle();
  if (!listing?.is_own_listing || !ai.ai_staff_listing_kit) notFound();
  const d = (listing.data ?? {}) as Record<string, unknown>;
  const address = typeof d.UnparsedAddress === "string" ? d.UnparsedAddress : (listing.city ?? key);

  const { data: kits } = await supabase.from("ai_drafts").select("id, kind, status, content, sent_via, updated_at, approved_at").eq("listing_key", key).eq("kind", "listing_kit").eq("owner_id", profile.id).in("status", ["draft", "approved"]).order("updated_at", { ascending: false }).limit(10);
  const latest = kits?.[0];
  const initial: KitView | null = latest ? { id: latest.id, kind: "listing_kit", status: latest.status as KitView["status"], parts: cleanParts("listing_kit", latest.content), sent_via: latest.sent_via } : null;
  const older = (kits ?? []).slice(1).filter((k) => k.status === "approved");

  return (
    <ConsoleShell profile={profile} current="listings" eyebrow="Our listings · Launch kit" title={address}>
      <Link href="/listings" className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
        ← Our listings
      </Link>
      <Panel title="Launch kit">
        <p className={`${mutedCls} mb-4`}>
          {key} · {listing.list_price != null ? usd.format(Number(listing.list_price)) : "No price"} · {listing.bedrooms_total ?? "?"} bd · {listing.bathrooms_total ?? "?"} ba. The assistant reads the public listing facts only. You check, approve, then copy each part where it goes (MLS, social, email) or print the flyer.
        </p>
        <KitPanel listingKey={key} initial={initial} />
      </Panel>
      {older.length > 0 && (
        <Panel title="Earlier approved kits">
          <ul className="space-y-1 font-body text-body-sm">
            {older.map((k) => (
              <li key={k.id}>
                <Link href={`/listings/${encodeURIComponent(key)}/kit/${k.id}/flyer`} className="text-navy underline">
                  Flyer from {fmtWhen(k.approved_at)}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </ConsoleShell>
  );
}
