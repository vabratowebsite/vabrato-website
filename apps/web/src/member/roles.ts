import type { UserRole } from "@vabrato/db";

// Member roles (SPEC G3) vs staff roles. Staff use the agent console, not /my.

export const MEMBER_ROLES = ["buyer", "seller", "both"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const isMemberRole = (role: UserRole | null | undefined): role is MemberRole =>
  role === "buyer" || role === "seller" || role === "both";

export const isStaffRole = (role: UserRole | null | undefined) =>
  role === "admin" || role === "agent" || role === "va" || role === "tc";

export const buys = (role: MemberRole) => role === "buyer" || role === "both";
export const sells = (role: MemberRole) => role === "seller" || role === "both";

/** Where /my sends a member first. */
export const homeFor = (role: MemberRole) => (buys(role) ? "/my/buyer" : "/my/seller");

export const ROLE_CHOICES: { value: MemberRole; label: string; detail: string }[] = [
  { value: "buyer", label: "Buying", detail: "Save homes, set alerts, track offers." },
  { value: "seller", label: "Selling", detail: "Value my home, follow my sale." },
  { value: "both", label: "Both", detail: "Selling one home and buying the next." },
];

export const CONSOLE_URL = (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.vabrato.com").replace(/\/+$/, "");
