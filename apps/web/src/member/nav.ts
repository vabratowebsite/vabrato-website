import { buys, sells, type MemberRole } from "./roles";

// Portal navigation by role (mockup 00: "one login; role decides which
// sections show; Both sees both"). Only pages that exist are listed; later S5
// PRs add saved homes, searches, tours, documents and messages.

export type PortalPage = "buyer" | "saved" | "searches" | "compare" | "sold" | "seller" | "account";

export interface NavGroup {
  label?: string;
  items: { key: PortalPage | "search"; label: string; href: string }[];
}

/** `vow`: show "Sold near me" (vow_enabled on; the page asks for the terms if needed). */
export function portalNav(role: MemberRole, opts: { vow?: boolean } = {}): NavGroup[] {
  const groups: NavGroup[] = [];
  if (buys(role)) {
    groups.push({
      label: role === "both" ? "Buying" : undefined,
      items: [
        { key: "buyer", label: "My home search", href: "/my/buyer" },
        { key: "saved", label: "Saved homes", href: "/my/saved" },
        { key: "searches", label: "Saved searches", href: "/my/searches" },
        { key: "compare", label: "Compare", href: "/my/compare" },
      ],
    });
  }
  if (sells(role)) groups.push({ label: role === "both" ? "Selling" : undefined, items: [{ key: "seller", label: "My sale", href: "/my/seller" }] });
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
