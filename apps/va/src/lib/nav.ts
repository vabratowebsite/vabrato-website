import type { UserRole } from "@vabrato/db";

// Agent console navigation (mockup 07). Only pages that exist are listed;
// later S6 PRs add Leads, Members, Our listings, MLS sync, Content, Reports
// and CMAs.

export type ConsolePage = "today" | "messages" | "open-houses" | "deals" | "vendors";

export interface ConsoleNavGroup {
  label: string;
  items: { key: ConsolePage; label: string; href: string; count?: number; current: boolean }[];
}

export function consoleNav(current: ConsolePage | null, counts: { unreadMessages?: number } = {}): ConsoleNavGroup[] {
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
      items: [item("today", "Today", "/"), item("messages", "Messages", "/messages", counts.unreadMessages), item("open-houses", "Open houses", "/open-houses")],
    },
    { label: "Transactions", items: [item("deals", "Deals", "/deals"), item("vendors", "Vendors", "/vendors")] },
  ];
}

const ROLE_LABEL: Partial<Record<UserRole, string>> = { admin: "Admin", agent: "Agent", va: "VA", tc: "TC" };

/** "Mark Martinho · Admin" for the sidebar footer. */
export function signedInAs(name: string, email: string, role: UserRole): string {
  return `${name.trim() || email} · ${ROLE_LABEL[role] ?? role}`;
}
