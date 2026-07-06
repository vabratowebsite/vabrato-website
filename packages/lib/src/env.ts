import { z } from "zod";

// Secrets live only in .env.local / Vercel env (CLAUDE.md). These helpers
// fail fast with the variable names — never the values — when config is wrong.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function parse<T>(schema: z.ZodType<T>, source: unknown, label: string): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid ${label} environment: check ${missing} (see .env.example)`);
  }
  return result.data;
}

export function publicEnv(source: NodeJS.ProcessEnv = process.env): PublicEnv {
  return parse(publicSchema, source, "public");
}

export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return parse(serverSchema, source, "server");
}
