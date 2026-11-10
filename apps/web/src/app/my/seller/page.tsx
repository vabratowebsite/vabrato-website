import { redirect } from "next/navigation";
import { Button, Panel } from "@vabrato/ui/web";
import { computeCoe, fmtLong } from "@vabrato/lib";
import { MemberShell } from "@/member/components/MemberShell";
import { sells } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// Seller portal home (mockup 06). S5 PR 5 adds the timeline, to-dos, wiring
// banner and listing performance; for now, the sale on file (RLS: only deals
// this member is on).
export default async function SellerHome() {
  const member = await requirePortalMember("/my/seller");
  if (!sells(member.role)) redirect("/my/buyer");
  const { data: deals } = await member.supabase
    .from("deals")
    .select("id, address, ratification_date, days_to_close, status")
    .order("created_at", { ascending: false });
  const active = (deals ?? []).filter((d) => d.status === "active");

  return (
    <MemberShell member={member} role={member.role} current="seller" eyebrow="Seller portal" title={active[0] ? "Your sale" : "Selling with Vabrato"}>
      {active.length === 0 ? (
        <Panel title="No sale on file yet">
          <div className="space-y-4 font-body text-body text-ink">
            <p>
              When your agent adds you to a transaction, your sale timeline appears here. Make sure they use this email address: <strong>{member.profile.email}</strong>.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href="/sell" variant="navy" underline={false}>
                Get a home valuation
              </Button>
              <Button href="/transform">Pre-sale projects</Button>
            </div>
          </div>
        </Panel>
      ) : (
        active.map((d) => (
          <Panel key={d.id} title={d.address}>
            <dl className="grid gap-4 font-body text-body text-ink sm:grid-cols-2">
              <div>
                <dt className="text-label uppercase tracking-label text-muted">Contract ratified</dt>
                <dd>{fmtLong(d.ratification_date)}</dd>
              </div>
              <div>
                <dt className="text-label uppercase tracking-label text-muted">Close of escrow</dt>
                <dd>{fmtLong(computeCoe(d.ratification_date, d.days_to_close))}</dd>
              </div>
            </dl>
          </Panel>
        ))
      )}
    </MemberShell>
  );
}
