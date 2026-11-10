import { z } from "zod";

// MLS settings come only from environment variables (Render / Vercel / .env.local).
// Until MLSListings credentials arrive, MLS_MODE=mock and no credentials are needed.
// Errors name the missing variables, never their values.

const yearsOrDefault = z.coerce.number().int().min(1).max(10).default(3);

const base = z.object({
  MLS_MODE: z.enum(["mock", "live"]).default("mock"),
  // Broker Code VABRA or Office ID VABRA-1: confirm which one the feed uses (SPEC open questions).
  MLS_OFFICE_ID: z.string().min(1).default("VABRA"),
  // Requests per second to the RESO API. Lower it if MLSListings publishes a stricter limit.
  MLS_RATE_LIMIT_PER_SEC: z.coerce.number().positive().max(50).default(2),
  // hotlink: keep the feed's MediaURL. copy: store photos in Supabase Storage
  // (bucket mls-photos). Use copy only once MLSListings allows it (SPEC open questions).
  MLS_PHOTO_MODE: z.enum(["hotlink", "copy"]).default("hotlink"),
  // Sold history depth: 3 or 5 years, pending MLSListings (SPEC open questions).
  MLS_SOLD_HISTORY_YEARS: yearsOrDefault,
});

const live = base.extend({
  MLS_MODE: z.literal("live"),
  MLS_API_BASE_URL: z.string().url(),
  MLS_TOKEN_URL: z.string().url(),
  MLS_CLIENT_ID: z.string().min(1),
  MLS_CLIENT_SECRET: z.string().min(1),
});

interface CommonConfig {
  officeId: string;
  rateLimitPerSec: number;
  photoMode: "hotlink" | "copy";
  soldHistoryYears: number;
}

export type MlsConfig =
  | ({ mode: "mock" } & CommonConfig)
  | ({ mode: "live"; apiBaseUrl: string; tokenUrl: string; clientId: string; clientSecret: string } & CommonConfig);

export function mlsConfig(source: Record<string, string | undefined> = process.env): MlsConfig {
  const parsedBase = base.safeParse(source);
  if (!parsedBase.success) throw configError(parsedBase.error);
  const b = parsedBase.data;
  const common: CommonConfig = {
    officeId: b.MLS_OFFICE_ID,
    rateLimitPerSec: b.MLS_RATE_LIMIT_PER_SEC,
    photoMode: b.MLS_PHOTO_MODE,
    soldHistoryYears: b.MLS_SOLD_HISTORY_YEARS,
  };
  if (b.MLS_MODE === "mock") return { mode: "mock", ...common };

  const parsedLive = live.safeParse(source);
  if (!parsedLive.success) throw configError(parsedLive.error);
  const env = parsedLive.data;
  return {
    mode: "live",
    ...common,
    apiBaseUrl: env.MLS_API_BASE_URL,
    tokenUrl: env.MLS_TOKEN_URL,
    clientId: env.MLS_CLIENT_ID,
    clientSecret: env.MLS_CLIENT_SECRET,
  };
}

function configError(error: z.ZodError): Error {
  const names = error.issues.map((i) => i.path.join(".")).join(", ");
  return new Error(`Invalid MLS environment: check ${names} (see .env.example)`);
}
