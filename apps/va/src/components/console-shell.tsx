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
  const [unread, newLeads, syncDown, aiTest] = await Promise.all([unreadMemberMessages(), newLeadCount(), syncIncidentOpen(), aiTestModeForMe()]);
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
          {syncDown && current !== "mls" && (
            <p role="note" className="border border-red/40 bg-red-50 px-4 py-3 font-body text-body-sm text-red">
              The MLS sync is failing or late. Listing changes may not be on the site.{" "}
              <a href="/mls" className="underline">
                MLS sync
              </a>
            </p>
          )}
          {aiTest && (
            <p role="note" className="border border-gold bg-gold-50 px-4 py-3 font-body text-body-sm text-gold-ink">
              <strong>AI test mode:</strong> use only fictional data. The assistant works on test deals and on your own typed text; real client records never reach it.{" "}
              <a href="/assistant" className="underline">
                Assistant
              </a>
            </p>
          )}
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

/** True while AI test mode is on and this person is one of its testers (0044). */
async function aiTestModeForMe(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("ai_features_available", { p_features: [] });
  return (data as { mode?: string } | null)?.mode === "test";
}

/** True while the feed is live and a sync incident is open (0023). */
async function syncIncidentOpen(): Promise<boolean> {
  const supabase = await supabaseServer();
  const [{ data: st }, { data: s }] = await Promise.all([
    supabase.from("sync_alert_state").select("incident_open").maybeSingle(),
    supabase.from("app_settings").select("mls_sync_live").maybeSingle(),
  ]);
  return Boolean(st?.incident_open && s?.mls_sync_live);
}
