import type { UserRole } from "@vabrato/db";

// Agent console navigation (mockup 07). Only pages that exist are listed.

export type ConsolePage =
  | "today"
  | "leads"
  | "members"
  | "listings"
  | "mls"
  | "assistant"
  | "messages"
  | "open-houses"
  | "content"
  | "featured"
  | "reports"
  | "stats"
  | "cmas"
  | "deals"
  | "vendors"
  | "profile"
  | "settings";

export interface ConsoleNavGroup {
  label: string;
  items: { key: ConsolePage; label: string; href: string; count?: number; current: boolean }[];
}

export function consoleNav(current: ConsolePage | null, counts: { unreadMessages?: number; newLeads?: number } = {}): ConsoleNavGroup[] {
  const item = (key: ConsolePage, label: string, href: string, count?: number) => ({
    key,
    label,
    href,
    current: key === current,
    ...(count ? { count } : {}),
  });
  return [
    {
      label: "Staff",
      items: [
        item("today", "Today", "/"),
        item("leads", "Leads", "/leads", counts.newLeads),
        item("members", "Members", "/members"),
        item("messages", "Messages", "/messages", counts.unreadMessages),
        item("listings", "Our listings", "/listings"),
        item("open-houses", "Open houses", "/open-houses"),
        item("mls", "MLS sync", "/mls"),
        item("assistant", "Assistant", "/assistant"),
      ],
    },
    { label: "Website", items: [item("content", "Content", "/content"), item("featured", "Featured listings", "/featured")] },
    { label: "Reports", items: [item("reports", "Seller reports", "/reports"), item("stats", "Market stats", "/stats"), item("cmas", "CMAs", "/cmas")] },
    { label: "Transactions", items: [item("deals", "Deals", "/deals"), item("vendors", "Vendors", "/vendors")] },
    { label: "Account", items: [item("profile", "My profile", "/profile"), item("settings", "Settings", "/settings")] },
  ];
}

const ROLE_LABEL: Partial<Record<UserRole, string>> = { admin: "Admin", agent: "Agent", va: "VA", tc: "TC" };

/** "Mark Martinho · Admin" for the sidebar footer. */
export function signedInAs(name: string, email: string, role: UserRole): string {
  return `${name.trim() || email} · ${ROLE_LABEL[role] ?? role}`;
}
