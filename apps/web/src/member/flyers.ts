import type { SupabaseDb } from "@vabrato/lib";
import { ORG } from "@/lib/org";
import { resolveListingPhoto } from "@/lib/photos";
import { PROMO_KINDS, isPromoKind, type PromoKind } from "./assistant/kinds";

// A seller's flyers (S5b PR 6, 0041). The words are the seller's (edited from
// Ask Vabrato's suggestion, frozen when sent); everything else on an approved
// flyer comes from our records when it's shown: the listing's facts and first
// photo (our own listing only), the open-house time the agent picked, and the
// agent's card. Read with the member's own client, so RLS applies.

/** The brokerage line our code adds to every flyer and post (never written by the model). */
export const BROKERAGE_LINE = `${ORG.name} · DRE #${ORG.corporateDre}`;

export const FLYER_STATUS = { pending: "Waiting for your agent", approved: "Approved", declined: "Not approved" } as const;
export type FlyerStatus = keyof typeof FLYER_STATUS;

export interface FlyerRow {
  id: string;
  kind: PromoKind;
  headline: string;
  highlights: string[];
  blurb: string;
  instagram: string;
  facebook: string;
  status: FlyerStatus;
  declineNote: string | null;
  createdAt: string;
  listingKey: string | null;
  openHouseKey: string | null;
  decidedBy: string | null;
}

const COLS = "id, kind, headline, highlights, blurb, instagram, facebook, status, decline_note, created_at, listing_key, open_house_key, decided_by";
type Raw = { id: string; kind: string; headline: string; highlights: string; blurb: string; instagram: string; facebook: string; status: string; decline_note: string | null; created_at: string; listing_key: string | null; open_house_key: string | null; decided_by: string | null };

const toRow = (r: Raw): FlyerRow => ({
  id: r.id,
  kind: isPromoKind(r.kind) ? r.kind : "open_house",
  headline: r.headline,
  highlights: r.highlights.split("\n").filter(Boolean),
  blurb: r.blurb,
  instagram: r.instagram,
  facebook: r.facebook,
  status: r.status === "approved" || r.status === "declined" ? r.status : "pending",
  declineNote: r.decline_note,
  createdAt: r.created_at,
  listingKey: r.listing_key,
  openHouseKey: r.open_house_key,
  decidedBy: r.decided_by,
});

export async function listFlyers(db: SupabaseDb, profileId: string): Promise<FlyerRow[]> {
  const { data } = await db.from("member_promos").select(COLS).eq("profile_id", profileId).order("created_at", { ascending: false }).limit(20);
  return ((data ?? []) as Raw[]).map(toRow);
}

export async function getFlyer(db: SupabaseDb, profileId: string, id: string): Promise<FlyerRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db.from("member_promos").select(COLS).eq("id", id).eq("profile_id", profileId).maybeSingle();
  return data ? toRow(data as Raw) : null;
}

const pacific = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...opts }).format(new Date(iso));

/** "Sunday, Nov 22 · 1:00–4:00 PM" in Pacific time; null without a start time. */
export function openHouseWhen(start: string | null, end: string | null): string | null {
  if (!start || Number.isNaN(Date.parse(start))) return null;
  const day = pacific(start, { weekday: "long", month: "short", day: "numeric" });
  const from = pacific(start, { hour: "numeric", minute: "2-digit" });
  if (!end || Number.isNaN(Date.parse(end))) return `${day} · ${from}`;
  const to = pacific(end, { hour: "numeric", minute: "2-digit" });
  const sameHalf = from.slice(-2) === to.slice(-2);
  return `${day} · ${sameHalf ? from.slice(0, -3) : from}–${to}`;
}

export interface FlyerFacts {
  /** The street address, or the city when the listing hides it. */
  address: string;
  city: string;
  price: string | null;
  facts: string[];
  photo: string | null;
  when: string | null;
  agent: { name: string; title: string | null; phone: string | null; email: string | null; dre: string | null } | null;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * The facts for an approved flyer, from our records. Null when the listing is
 * no longer one the member can see (closed or withdrawn) or isn't ours.
 */
export async function flyerFacts(db: SupabaseDb, f: FlyerRow, assignedAgentId: string | null): Promise<FlyerFacts | null> {
  if (f.status !== "approved" || !f.listingKey) return null;
  const { data: listing } = await db
    .from("mls_listings")
    .select("listing_key, list_price, city, bedrooms_total, bathrooms_total, living_area, address_display, data, is_own_listing, standard_status")
    .eq("listing_key", f.listingKey)
    .maybeSingle();
  if (!listing?.is_own_listing || listing.standard_status === "Closed" || listing.standard_status === "Withdrawn" || listing.standard_status === "Canceled" || listing.standard_status === "Expired") return null;
  const agentIds = [...new Set([f.decidedBy, assignedAgentId].filter((x): x is string => Boolean(x)))];
  const [{ data: media }, oh, { data: agents }] = await Promise.all([
    db.from("mls_media").select("url, storage_path").eq("listing_key", f.listingKey).order("sort_order").limit(1),
    f.openHouseKey ? db.from("mls_open_houses").select("start_time, end_time").eq("open_house_key", f.openHouseKey).maybeSingle() : Promise.resolve({ data: null }),
    agentIds.length ? db.from("agent_profiles").select("profile_id, display_name, title, phone, email, license_number").in("profile_id", agentIds).eq("published", true) : Promise.resolve({ data: [] }),
  ]);
  const d = (listing.data ?? {}) as Record<string, unknown>;
  const city = listing.city ?? "";
  const address = listing.address_display && typeof d.UnparsedAddress === "string" ? d.UnparsedAddress : city;
  const a = (agents ?? []).find((x) => x.profile_id === f.decidedBy) ?? (agents ?? [])[0] ?? null;
  const o = oh.data as { start_time: string | null; end_time: string | null } | null;
  return {
    address,
    city,
    price: listing.list_price != null ? usd.format(Number(listing.list_price)) : null,
    facts: [
      listing.bedrooms_total != null ? `${listing.bedrooms_total} bedrooms` : null,
      listing.bathrooms_total != null ? `${listing.bathrooms_total} bathrooms` : null,
      listing.living_area ? `${Number(listing.living_area).toLocaleString("en-US")} sq ft` : null,
    ].filter((x): x is string => Boolean(x)),
    photo: resolveListingPhoto(media?.[0])?.src ?? null,
    when: o ? openHouseWhen(o.start_time, o.end_time) : null,
    agent: a ? { name: a.display_name, title: a.title, phone: a.phone, email: a.email, dre: a.license_number } : null,
  };
}

/** A post with the brokerage line our code adds. */
export const postWithBrokerage = (text: string) => `${text.trim()}\n\n${BROKERAGE_LINE}`;

export const kindLabel = (k: PromoKind) => PROMO_KINDS[k];
