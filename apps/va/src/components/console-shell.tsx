import type { ReactNode } from "react";
import type { Profile } from "@vabrato/db";
import { PortalShell, cx, focusDark } from "@vabrato/ui/web";
import { signOutAction } from "@/lib/actions";
import { consoleNav, signedInAs, type ConsolePage } from "@/lib/nav";
import { NotificationBell } from "./notification-bell";
import { supabaseServer } from "@/lib/supabase-server";

// Agent console frame (mockup 07): navy sidebar with Staff / Transactions
// groups, white top bar, signed-in box with sign-out. Every staff page renders
// inside it; RLS still decides what each person sees.

export async function ConsoleShell({
  profile,
  current,
  eyebrow = "Agent console",
  title,
  topRight,
  children,
}: {
  profile: Profile;
  current: ConsolePage | null;
  eyebrow?: string;
  title: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const [unread, newLeads] = await Promise.all([unreadMemberMessages(), newLeadCount()]);
  const nav = consoleNav(current, { unreadMessages: current === "messages" ? 0 : unread, newLeads }).map((g) => ({
    label: g.label,
    items: g.items.map(({ label, href, count, current: isCurrent }) => ({ label, href, current: isCurrent, ...(count ? { count } : {}) })),
  }));

  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
      >
        Skip to content
      </a>
      <PortalShell
        nav={nav}
        eyebrow={eyebrow}
        title={title}
        topRight={
          <>
            {topRight}
            <NotificationBell />
          </>
        }
        sidebarFooter={
          <div className="space-y-3">
            <p>
              <span className="block text-[10px] uppercase tracking-wide text-white/75">Signed in as</span>
              {signedInAs(profile.full_name, profile.email, profile.role)}
            </p>
            <form action={signOutAction}>
              <button type="submit" className={cx("min-h-[44px] border border-white/70 px-4 text-[11px] font-medium uppercase tracking-label text-white hover:bg-white hover:text-navy", focusDark)}>
                Sign out
              </button>
            </form>
          </div>
        }
      >
        <div id="main" tabIndex={-1} className="space-y-6 outline-none">
          {children}
        </div>
      </PortalShell>
    </>
  );
}

/** Member messages waiting for staff (RLS: only threads this person may see). */
async function unreadMemberMessages(): Promise<number> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("messages").select("member_id, sender_id").is("read_at", null).limit(500);
  return (data ?? []).filter((m) => m.sender_id === m.member_id).length;
}

/** New leads this person can see (RLS: all for the acting lead admin, else their own). */
async function newLeadCount(): Promise<number> {
  const supabase = await supabaseServer();
  const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new");
  return count ?? 0;
}
