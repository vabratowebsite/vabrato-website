import { createHash } from "node:crypto";
import { z } from "zod";

// Public lead forms (contact, valuation, tour, transform, newsletter).
// Abuse protection (review item 12):
//   - honeypot field `website` (bots fill it; we pretend success and drop it)
//   - Cloudflare Turnstile when TURNSTILE_SECRET_KEY is set (skipped if unset)
//   - per-IP limit in the database via ip_hash = sha256(LEAD_IP_SALT + ip);
//     the raw IP is never stored. Without a salt, no ip_hash is sent.
//   - per-email limit in the database (5/hour)
// Leads are inserted without .select(): the public can never read them back.

export const LEAD_KINDS = ["contact", "valuation", "tour", "transform", "newsletter", "open_house_signin"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();

export const LeadSchema = z.object({
  kind: z.enum(LEAD_KINDS),
  name: trimmed(120),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  phone: trimmed(40).refine((v) => !v || /^[0-9()+.\-\s]{7,40}$/.test(v), "Enter a valid phone number."),
  message: trimmed(4000),
  listingKey: trimmed(64),
  citySlug: trimmed(64),
  consentContact: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  site: z.enum(["vabrato", "sancarloslife"]).catch("vabrato"),
  // Kind-specific details (tour date and mode, property address, ...).
  payload: z.record(z.string().max(500)).default({}),
});
export type LeadInput = z.infer<typeof LeadSchema>;

/** Field names in the form that go into `payload`, per kind. */
const PAYLOAD_FIELDS: Record<LeadKind, string[]> = {
  contact: ["topic", "agent"],
  valuation: ["address", "timeline"],
  tour: ["tourDate", "tourMode"],
  transform: ["address", "projectType", "budget"],
  newsletter: [],
  // Sent through submit_open_house_signin() with the event's link token.
  open_house_signin: ["hasAgent"],
};

export type ParsedLead =
  | { ok: true; lead: LeadInput; honeypot: boolean }
  | { ok: false; fieldErrors: Record<string, string> };

export function parseLeadForm(form: FormData): ParsedLead {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const kind = get("kind");
  const payload: Record<string, string> = {};
  if (kind && (LEAD_KINDS as readonly string[]).includes(kind)) {
    for (const f of PAYLOAD_FIELDS[kind as LeadKind]) {
      const v = get(f)?.trim();
      if (v) payload[f] = v.slice(0, 500);
    }
  }
  const parsed = LeadSchema.safeParse({
    kind,
    name: get("name"),
    email: get("email") ?? "",
    phone: get("phone"),
    message: get("message"),
    listingKey: get("listingKey"),
    citySlug: get("citySlug"),
    consentContact: get("consentContact"),
    site: get("site"),
    payload,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.path[0] === "kind" ? "This form can't be sent." : issue.message;
    }
    return { ok: false, fieldErrors };
  }
  return { ok: true, lead: parsed.data, honeypot: Boolean(get("website")) };
}

/** First client IP from the proxy headers. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || null;
}

export function hashIp(ip: string | null, salt: string | undefined): string | null {
  if (!ip || !salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Cloudflare Turnstile check. Returns true when Turnstile isn't configured. */
export async function verifyTurnstile(
  token: string | null,
  ip: string | null,
  secret: string | undefined = process.env.TURNSTILE_SECRET_KEY,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await doFetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store" });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** Row for public.leads (column names). */
export function leadRow(lead: LeadInput, ipHash: string | null) {
  return {
    kind: lead.kind,
    name: lead.name ?? null,
    email: lead.email,
    phone: lead.phone ?? null,
    message: lead.message ?? null,
    listing_key: lead.listingKey ?? null,
    city_slug: lead.citySlug ?? null,
    payload: lead.payload,
    consent_contact: lead.consentContact,
    site: lead.site,
    ip_hash: ipHash,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The sign-in link token from an open-house form, or null. */
export function signinToken(form: FormData): string | null {
  const v = form.get("signinToken");
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}
