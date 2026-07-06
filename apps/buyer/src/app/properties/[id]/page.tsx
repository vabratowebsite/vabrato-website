import { notFound } from "next/navigation";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { deletePropertyAction, updateStatusAction } from "@/lib/actions";
import { requireSignIn } from "@/lib/auth";
import { PROPERTY_STATUSES, STATUS_LABELS, type PropertyStatus } from "@/lib/property-schema";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, allowed } = await requireSignIn();
  if (!allowed) return <AccessDenied profile={profile} />;

  const supabase = await supabaseServer();
  const { data: property } = await supabase
    .from("tracked_properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const { data: events } = await supabase
    .from("property_events")
    .select("*")
    .eq("tracked_property_id", id)
    .order("occurred_at", { ascending: false });

  const current = (
    property.status in STATUS_LABELS ? property.status : "watching"
  ) as PropertyStatus;

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <h1 className="font-serif text-xl leading-tight">{property.address}</h1>
          {property.source && (
            <p className="mt-1 text-sm" style={{ color: T.muted }}>
              via {property.source}
            </p>
          )}
        </div>

        <Panel title="Status">
          <div className="flex flex-wrap gap-2">
            {PROPERTY_STATUSES.map((status) => {
              const active = status === current;
              return (
                <form key={status} action={updateStatusAction.bind(null, property.id, status)}>
                  <button
                    className="rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{
                      background: active ? T.ink : T.surface,
                      color: active ? T.gold : T.muted,
                      border: `1px solid ${active ? T.ink : T.line}`,
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                </form>
              );
            })}
          </div>
        </Panel>

        <Panel title="Activity">
          {!events?.length ? (
            <p className="text-sm" style={{ color: T.muted }}>
              No activity yet. Once inbound email parsing is connected, listing updates (price
              changes, open houses, status changes) will land here automatically.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: T.gold }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{e.kind.replace(/_/g, " ")}</span>
                    <span className="ml-2 text-xs" style={{ color: T.muted }}>
                      {new Date(e.occurred_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <form action={deletePropertyAction.bind(null, property.id)}>
          <button className="text-sm" style={{ color: T.red }}>
            Stop tracking this property
          </button>
        </form>
      </main>
    </div>
  );
}
