// Public URL of an agent photo in the agent-photos bucket (0024). The path is
// "<profile id>/<file name>", checked by the database.

export function agentPhotoUrl(supabaseUrl: string | undefined, path: string | null | undefined): string | null {
  if (!supabaseUrl || !path || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/.test(path)) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/agent-photos/${path}`;
}
