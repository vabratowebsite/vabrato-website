import { ListingPhotoPlaceholder } from "@vabrato/ui/web";
import { agentPhotoUrl } from "@vabrato/lib";

// Agent headshot from the public agent-photos bucket (uploaded in the
// console, S6 PR 4), or the placeholder until there is one.
export function AgentPhoto({ name, path, eager }: { name: string; path: string | null; eager?: boolean }) {
  const src = agentPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, path);
  if (!src) return <ListingPhotoPlaceholder tint="steel" label={`${name} photo (placeholder)`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- public bucket image, fixed aspect box
    <img src={src} alt={`Photo of ${name}`} loading={eager ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
  );
}
