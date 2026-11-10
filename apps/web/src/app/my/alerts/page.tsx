import { redirect } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { mlsLastUpdated } from "@/lib/public/listings";
import { alertFeed } from "@/member/alerts";
import { AlertFeed } from "@/member/components/AlertFeed";
import { MemberShell } from "@/member/components/MemberShell";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// Everything that changed for the member's saved homes and searches. Opening
// the page marks the feed seen (clears the bell); the RPC touches only the
// member's own rows.
export default async function AlertsPage() {
  const member = await requirePortalMember("/my/alerts");
  if (!buys(member.role)) redirect("/my/seller");
  const [items, lastUpdated] = await Promise.all([alertFeed(member.supabase, 100), mlsLastUpdated()]);
  if (items.some((i) => !i.seen)) await member.supabase.rpc("mark_alerts_seen");

  return (
    <MemberShell member={member} role={member.role} current="alerts" eyebrow="Buyer portal" title="What changed">
      {!member.profile.alerts_email_opt_in && (
        <p role="note" className="border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
          Alert emails are off. Updates still appear here.{" "}
          <a href="/my/account" className="text-navy underline">
            Turn on alert emails
          </a>
        </p>
      )}
      <Panel title="All activity">
        <AlertFeed items={items} emptyText="Nothing new yet. Save homes and searches, and we'll show new listings and price changes here." />
      </Panel>
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
