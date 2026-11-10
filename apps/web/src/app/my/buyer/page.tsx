import { Button, Panel } from "@vabrato/ui/web";
import { MemberShell } from "@/member/components/MemberShell";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { redirect } from "next/navigation";

// Buyer portal home (mockup 05). S5 PR 2-4 fill it: saved homes and
// searches, alerts and "What changed", homes I'm pursuing, tours.
export default async function BuyerHome() {
  const member = await requirePortalMember("/my/buyer");
  if (!buys(member.role)) redirect("/my/seller");
  const first = member.profile.full_name.split(/\s+/)[0];
  return (
    <MemberShell member={member} role={member.role} current="buyer" eyebrow="Buyer portal" title={first ? `Welcome, ${first}` : "Welcome"}>
      <Panel title="Start your home search">
        <div className="space-y-4 font-body text-body text-ink">
          <p>Search every home for sale in San Mateo and Santa Clara Counties. Saved homes, saved searches and alerts appear here as you use them.</p>
          <div className="flex flex-wrap gap-3">
            <Button href="/search" variant="navy" underline={false}>
              Search homes
            </Button>
            <Button href="/open-houses">Open houses</Button>
          </div>
        </div>
      </Panel>
    </MemberShell>
  );
}
