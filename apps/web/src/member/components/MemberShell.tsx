import type { ReactNode } from "react";
import { Avatar, EqualHousingIcon, PortalShell } from "@vabrato/ui/web";
import { BROKER_DISCLOSURE, ORG } from "@/lib/org";
import { flagEnabled } from "@/lib/public/listings";
import { MemberQueryProvider } from "./MemberQueryProvider";
import { portalNav, initials, type PortalPage } from "../nav";
import type { MemberRole } from "../roles";
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
  const [agent, vow] = await Promise.all([assignedAgent(member.supabase, member.profile.agent_id), flagEnabled("vow_enabled")]);
  const nav = portalNav(role, { vow }).map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({ label: it.label, href: it.href, current: it.key === current })),
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
