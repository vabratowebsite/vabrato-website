import Link from "next/link";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { requireSignIn } from "@/lib/auth";
import { STATUS_LABELS, type PropertyStatus } from "@/lib/property-schema";
import { supabaseServer } from "@/lib/supabase-server";
import { AddPropertyForm } from "./add-property-form";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<PropertyStatus, string> = {
  watching: "#726A5C",
  toured: "#3E7CA8",
  offer_made: "#BE8A2C",
  in_escrow: "#9F7B37",
  purchased: "#4F7A52",
  lost: "#B44A3D",
};

export default async function Home() {
  const { profile, allowed } = await requireSignIn();
  if (!allowed) return <AccessDenied profile={profile} />;

  // RLS scopes rows to buyer_id = auth.uid().
  const supabase = await supabaseServer();
  const { data: properties } = await supabase
    .from("tracked_properties")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <Panel title="Track a property">
          <AddPropertyForm />
        </Panel>

        {!properties?.length ? (
          <p className="text-sm" style={{ color: T.muted }}>
            Nothing tracked yet. Add the first property you&rsquo;re pursuing above.
          </p>
        ) : (
          <ul className="space-y-3">
            {properties.map((p) => {
              const status = (p.status in STATUS_LABELS ? p.status : "watching") as PropertyStatus;
              return (
                <li key={p.id}>
                  <Link
                    href={`/properties/${p.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl p-5 transition-shadow hover:shadow-md"
                    style={{ background: T.surface, border: `1px solid ${T.line}` }}
                  >
                    <div className="min-w-0">
                      <div className="font-serif">{p.address}</div>
                      {p.source && (
                        <div className="mt-0.5 text-xs" style={{ color: T.muted }}>
                          via {p.source}
                        </div>
                      )}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: `${STATUS_COLORS[status]}1F`,
                        color: STATUS_COLORS[status],
                      }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
