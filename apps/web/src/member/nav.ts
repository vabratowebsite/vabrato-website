import { buys, sells, type MemberRole } from "./roles";

// Portal navigation by role (mockup 00: "one login; role decides which
// sections show; Both sees both"). Only pages that exist are listed; later S5
// PRs add saved homes, searches, tours, documents and messages.

export type PortalPage = "buyer" | "alerts" | "saved" | "searches" | "compare" | "tours" | "sold" | "seller" | "seller-performance" | "documents" | "messages" | "assistant" | "todos" | "drafts" | "account";

export interface NavGroup {
  label?: string;
  items: { key: PortalPage | "search" | "home-value" | "pre-sale"; label: string; href: string; count?: number }[];
}

/**
 * `vow`: show "Sold near me" (vow_enabled on; the page asks for the terms if
 * needed). `unreadMessages`: badge on Messages. `assistant`: show Ask
 * Vabrato (the master switch and at least one member feature on, S5b).
 * `todos`: show My to-dos (summarizing is on, or the member has to-dos).
 * `drafts`: show My drafts (a draft switch is on, or the member has drafts).
 */
export function portalNav(role: MemberRole, opts: { vow?: boolean; unreadMessages?: number; assistant?: boolean; todos?: boolean; drafts?: boolean } = {}): NavGroup[] {
  const groups: NavGroup[] = [];
  if (buys(role)) {
    groups.push({
      label: role === "both" ? "Buying" : undefined,
      items: [
        { key: "buyer", label: "My home search", href: "/my/buyer" },
        { key: "saved", label: "Saved homes", href: "/my/saved" },
        { key: "searches", label: "Saved searches", href: "/my/searches" },
        { key: "compare", label: "Compare", href: "/my/compare" },
        { key: "tours", label: "Tours", href: "/my/tours" },
      ],
    });
  }
  if (sells(role)) {
    groups.push({
      label: role === "both" ? "Selling" : undefined,
      items: [
        { key: "seller", label: "My sale", href: "/my/seller" },
        { key: "seller-performance", label: "Listing activity", href: "/my/seller/performance" },
        // The public request forms; signed-in requests are linked to the account.
        { key: "home-value", label: "Home value", href: "/sell" },
        { key: "pre-sale", label: "Pre-sale projects", href: "/transform" },
      ],
    });
  }
  // Shared by buyers and sellers, listed once.
  groups.push({
    label: role === "both" ? "Your team" : undefined,
    items: [
      { key: "documents", label: "Documents", href: "/my/documents" },
      { key: "messages", label: "Messages", href: "/my/messages", ...(opts.unreadMessages ? { count: opts.unreadMessages } : {}) },
    ],
  });
  const assistant: NavGroup["items"] = [
    ...(opts.assistant ? [{ key: "assistant" as const, label: "Ask Vabrato", href: "/my/assistant" }] : []),
    ...(opts.todos ? [{ key: "todos" as const, label: "My to-dos", href: "/my/todos" }] : []),
    ...(opts.drafts ? [{ key: "drafts" as const, label: "My drafts", href: "/my/drafts" }] : []),
  ];
  if (assistant.length) groups.push({ label: "Assistant", items: assistant });
  groups.push({
    label: "Explore",
    items: [{ key: "search", label: "Search homes", href: "/search" }, ...(opts.vow && buys(role) ? [{ key: "sold" as const, label: "Sold near me", href: "/my/sold" }] : [])],
  });
  groups.push({ label: "Account", items: [{ key: "account", label: "Account and alerts", href: "/my/account" }] });
  return groups;
}

/** Initials for the avatar: "Jordan Lee" → "JL"; falls back to the email. */
export function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const picked = parts.length >= 2 ? [parts[0]!, parts[parts.length - 1]!] : parts.length === 1 ? [parts[0]!] : [email];
  return picked
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
