import { z } from "zod";

// MLS settings come only from environment variables (Render / Vercel / .env.local).
// Until MLSListings credentials arrive, MLS_MODE=mock and no credentials are needed.
// Errors name the missing variables, never their values.

const base = z.object({
  MLS_MODE: z.enum(["mock", "live"]).default("mock"),
  // Broker Code VABRA or Office ID VABRA-1: confirm which one the feed uses (SPEC open questions).
  MLS_OFFICE_ID: z.string().min(1).default("VABRA"),
});

const live = base.extend({
  MLS_MODE: z.literal("live"),
  MLS_API_BASE_URL: z.string().url(),
  MLS_CLIENT_ID: z.string().min(1),
  MLS_CLIENT_SECRET: z.string().min(1),
});

export type MlsConfig =
  | { mode: "mock"; officeId: string }
  | { mode: "live"; officeId: string; apiBaseUrl: string; clientId: string; clientSecret: string };

export function mlsConfig(source: Record<string, string | undefined> = process.env): MlsConfig {
  const parsedBase = base.safeParse(source);
  if (!parsedBase.success) throw configError(parsedBase.error);
  if (parsedBase.data.MLS_MODE === "mock") {
    return { mode: "mock", officeId: parsedBase.data.MLS_OFFICE_ID };
  }
  const parsedLive = live.safeParse(source);
  if (!parsedLive.success) throw configError(parsedLive.error);
  const env = parsedLive.data;
  return {
    mode: "live",
    officeId: env.MLS_OFFICE_ID,
    apiBaseUrl: env.MLS_API_BASE_URL,
    clientId: env.MLS_CLIENT_ID,
    clientSecret: env.MLS_CLIENT_SECRET,
  };
}

function configError(error: z.ZodError): Error {
  const names = error.issues.map((i) => i.path.join(".")).join(", ");
  return new Error(`Invalid MLS environment: check ${names} (see .env.example)`);
}
