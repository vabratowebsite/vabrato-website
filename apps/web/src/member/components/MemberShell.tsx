import type { ReactNode } from "react";
import { Avatar, BellIcon, EqualHousingIcon, PortalShell } from "@vabrato/ui/web";
import { BROKER_DISCLOSURE, ORG } from "@/lib/org";
import { flagEnabled } from "@/lib/public/listings";
import { MemberQueryProvider } from "./MemberQueryProvider";
import { unseenAlertCount } from "../alerts";
import { portalNav, initials, type PortalPage } from "../nav";
import { buys, type MemberRole } from "../roles";
import { assignedAgent, type Member } from "../session";

// Portal frame for every /my page (mockups 05/06): role-based nav, agent card,
// avatar, and the broker disclosure + Equal Housing line that every
// vabrato.com page carries (S4 review item 2).

export async function MemberShell({
  member,
  role,
  current,
  eyebrow,
  title,
  topRight,
  children,
}: {
  member: Member;
  role: MemberRole;
  current: PortalPage;
  eyebrow?: string;
  title: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const [agent, vow, unseen, unread] = await Promise.all([
    assignedAgent(member.supabase, member.profile.agent_id),
    flagEnabled("vow_enabled"),
    buys(role) ? unseenAlertCount(member.supabase) : Promise.resolve(0),
    member.supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.profile.id)
      .neq("sender_id", member.profile.id)
      .is("read_at", null)
      .then((r) => r.count ?? 0),
  ]);
  const nav = portalNav(role, { vow, unreadMessages: current === "messages" ? 0 : unread }).map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({ label: it.label, href: it.href, current: it.key === current, ...(it.count ? { count: it.count } : {}) })),
  }));
  const name = member.profile.full_name || member.profile.email;

  return (
    <>
      <a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy">
        Skip to content
      </a>
      <PortalShell
        nav={nav}
        eyebrow={eyebrow}
        title={title}
        topRight={
          <>
            {topRight}
            {buys(role) && (
              <a
                href="/my/alerts"
                aria-current={current === "alerts" ? "page" : undefined}
                className="relative flex h-11 w-11 items-center justify-center text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <BellIcon size={20} />
                <span className="sr-only">What changed{unseen ? `, ${unseen} new` : ""}</span>
                {unseen > 0 && (
                  <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-gold px-1 text-[11px] font-bold text-ink">
                    {unseen > 99 ? "99+" : unseen}
                  </span>
                )}
              </a>
            )}
            <Avatar initials={initials(member.profile.full_name, member.profile.email)} label={`Signed in as ${name}`} />
          </>
        }
        sidebarFooter={<AgentCard agent={agent} />}
      >
        <div id="main" tabIndex={-1} className="space-y-6 outline-none">
          <MemberQueryProvider>{children}</MemberQueryProvider>
        </div>
        <footer className="mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-6 font-body text-caption text-muted">
          <EqualHousingIcon size={20} />
          <span>{BROKER_DISCLOSURE}</span>
          <span>
            <a href="/privacy" className="underline">
              Privacy
            </a>{" "}
            ·{" "}
            <a href="/terms" className="underline">
              Terms
            </a>
          </span>
        </footer>
      </PortalShell>
    </>
  );
}

function AgentCard({ agent }: { agent: Awaited<ReturnType<typeof assignedAgent>> }) {
  if (!agent) {
    const phone = ORG.phones[0];
    return (
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-white/75">Your team</p>
        <p className="font-medium">{ORG.name}</p>
        {phone && (
          <a href={`tel:${phone.number.replace(/[^0-9+]/g, "")}`} className="block text-white underline">
            {phone.number}
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-white/75">Your agent</p>
      <p className="font-medium">
        <a href={`/team/${agent.slug}`} className="text-white underline">
          {agent.display_name}
        </a>
      </p>
      {agent.title && <p className="text-white/85">{agent.title}</p>}
      {agent.phone && (
        <a href={`tel:${agent.phone.replace(/[^0-9+]/g, "")}`} className="block text-white underline">
          {agent.phone}
        </a>
      )}
      {agent.email && (
        <a href={`mailto:${agent.email}`} className="block break-all text-white underline">
          {agent.email}
        </a>
      )}
    </div>
  );
}
