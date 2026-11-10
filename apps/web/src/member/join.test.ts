import { describe, expect, it } from "vitest";
import { isMemberPath } from "@/lib/site";
import { hasAuthCookie } from "./components/MemberAwareHeader";
import {
  VOW_TERMS_VERSION,
  applyPendingJoin,
  authErrorMessage,
  authRedirectOrigin,
  callbackUrl,
  decodePendingJoin,
  encodePendingJoin,
  parseJoinForm,
  parseSignInForm,
  safeNext,
  type MemberRpc,
  type PendingJoin,
} from "./join";
import { initials, portalNav } from "./nav";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const EMAIL_JOIN = { provider: "email", role: "buyer", fullName: "Jordan Example", phone: "", email: "Jordan@Example.TEST" };

describe("parseJoinForm", () => {
  it("accepts an email join and normalises the address; consents default to off", () => {
    const r = parseJoinForm(form(EMAIL_JOIN));
    expect(r).toMatchObject({ ok: true, honeypot: false, data: { provider: "email", role: "buyer", email: "jordan@example.test", vow: false, alerts: false } });
  });

  it("records ticked consents separately", () => {
    const r = parseJoinForm(form({ ...EMAIL_JOIN, alerts: "on" }));
    expect(r.ok && r.data.alerts).toBe(true);
    expect(r.ok && r.data.vow).toBe(false);
  });

  it("requires a role, a name and a valid email", () => {
    const r = parseJoinForm(form({ provider: "email", role: "admin", fullName: "", email: "nope" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["email", "fullName", "role"]);
  });

  it("rejects a phone with letters", () => {
    const r = parseJoinForm(form({ ...EMAIL_JOIN, phone: "call me" }));
    expect(!r.ok && r.fieldErrors.phone).toBeTruthy();
  });

  it("Google join needs only the role and consents", () => {
    expect(parseJoinForm(form({ provider: "google", role: "both" }))).toMatchObject({ ok: true, data: { provider: "google", role: "both" } });
  });

  it("flags the honeypot", () => {
    expect(parseJoinForm(form({ ...EMAIL_JOIN, website: "spam" }))).toMatchObject({ ok: true, honeypot: true });
  });
});

describe("parseSignInForm", () => {
  it("validates the email path only", () => {
    expect(parseSignInForm(form({ provider: "email", email: "bad" })).ok).toBe(false);
    expect(parseSignInForm(form({ provider: "google" })).ok).toBe(true);
  });
});

describe("pending join cookie", () => {
  it("round-trips the member's choices", () => {
    const r = parseJoinForm(form({ ...EMAIL_JOIN, phone: "650-555-0101", alerts: "on" }));
    if (!r.ok) throw new Error("parse failed");
    expect(decodePendingJoin(encodePendingJoin(r.data))).toEqual({ role: "buyer", fullName: "Jordan Example", phone: "650-555-0101", vow: false, alerts: true });
  });

  it("ignores missing, oversized, malformed or tampered values", () => {
    expect(decodePendingJoin(undefined)).toBeNull();
    expect(decodePendingJoin("x".repeat(5000))).toBeNull();
    expect(decodePendingJoin("not-base64-json")).toBeNull();
    const tampered = Buffer.from(JSON.stringify({ role: "admin", vow: true, alerts: true })).toString("base64url");
    expect(decodePendingJoin(tampered)).toBeNull();
  });
});

describe("applyPendingJoin", () => {
  const fake = (fail: Record<string, string> = {}) => {
    const calls: [string, Record<string, unknown> | undefined][] = [];
    const db: MemberRpc = {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return { error: fail[fn] ? { message: fail[fn]! } : null };
      },
    };
    return { db, calls };
  };
  const p: PendingJoin = { role: "seller", fullName: "Avery Sample", vow: true, alerts: false };

  it("applies name, role, alert choice and onboarding; VOW only when the flag is on", async () => {
    const off = fake();
    expect(await applyPendingJoin(off.db, p, { vowEnabled: false })).toEqual([]);
    expect(off.calls.map((c) => c[0])).toEqual(["update_my_profile", "set_member_role", "set_alert_emails", "complete_onboarding"]);
    expect(off.calls[2]![1]).toEqual({ p_on: false });

    const on = fake();
    await applyPendingJoin(on.db, p, { vowEnabled: true });
    expect(on.calls.find((c) => c[0] === "accept_vow_terms")?.[1]).toEqual({ p_version: VOW_TERMS_VERSION });
  });

  it("never accepts VOW terms the member didn't tick", async () => {
    const f = fake();
    await applyPendingJoin(f.db, { ...p, vow: false }, { vowEnabled: true });
    expect(f.calls.some((c) => c[0] === "accept_vow_terms")).toBe(false);
  });

  it("leaves staff roles alone, and skips onboarding when a step fails", async () => {
    const staff = fake({ set_member_role: "role_not_member" });
    expect(await applyPendingJoin(staff.db, p, { vowEnabled: false })).toEqual([]);
    const broken = fake({ set_alert_emails: "boom" });
    expect(await applyPendingJoin(broken.db, p, { vowEnabled: false })).toEqual(["set_alert_emails"]);
    expect(broken.calls.some((c) => c[0] === "complete_onboarding")).toBe(false);
  });
});

describe("redirect safety", () => {
  it.each([
    [null, "/my"],
    ["/my/account", "/my/account"],
    ["/listing/FX-001/x?save=1", "/listing/FX-001/x?save=1"],
    ["https://evil.example/", "/my"],
    ["//evil.example", "/my"],
    ["/\\evil.example", "/my"],
    ["javascript:alert(1)", "/my"],
    ["/auth/callback?code=x", "/my"],
    ["/join", "/my"],
  ])("safeNext(%s) → %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });

  const env = { SITE_URL: "https://vabrato.com", VERCEL_URL: "vabrato-website-abc.vercel.app", NODE_ENV: "production" };
  it("uses the request origin only when it's ours", () => {
    expect(authRedirectOrigin("https://vabrato-website-abc.vercel.app", env)).toBe("https://vabrato-website-abc.vercel.app");
    expect(authRedirectOrigin("https://evil.example", env)).toBe("https://vabrato.com");
    expect(authRedirectOrigin("http://localhost:3003", env)).toBe("https://vabrato.com");
    expect(authRedirectOrigin("http://localhost:3003", { ...env, NODE_ENV: "development" })).toBe("http://localhost:3003");
  });

  it("builds the callback URL with next only when needed", () => {
    expect(callbackUrl("https://vabrato.com", "/my")).toBe("https://vabrato.com/auth/callback");
    expect(callbackUrl("https://vabrato.com", "/my/account")).toBe("https://vabrato.com/auth/callback?next=%2Fmy%2Faccount");
  });

  it("never shows raw auth errors", () => {
    expect(authErrorMessage("email rate limit exceeded")).toMatch(/wait a few minutes/);
    expect(authErrorMessage("Database error saving new user")).not.toMatch(/Database/);
  });
});

describe("portal nav", () => {
  it("shows sections by role (Both sees both)", () => {
    const hrefs = (r: Parameters<typeof portalNav>[0]) => portalNav(r).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs("buyer")).toEqual(["/my/buyer", "/search", "/my/account"]);
    expect(hrefs("seller")).toEqual(["/my/seller", "/search", "/my/account"]);
    expect(hrefs("both")).toEqual(["/my/buyer", "/my/seller", "/search", "/my/account"]);
    expect(portalNav("both").map((g) => g.label)).toEqual(["Buying", "Selling", "Explore", "Account"]);
  });

  it("makes initials", () => {
    expect(initials("Jordan Lee Example", "j@example.test")).toBe("JE");
    expect(initials("", "avery@example.test")).toBe("A");
  });
});

describe("member paths and header state", () => {
  it("refreshes sessions only on member paths", () => {
    expect(["/my", "/my/account", "/auth/callback", "/api/my/saved"].every(isMemberPath)).toBe(true);
    expect(["/", "/search", "/mystery", "/listing/FX-001/x", "/join"].some(isMemberPath)).toBe(false);
  });

  it("detects the Supabase auth cookie, including chunked ones", () => {
    expect(hasAuthCookie("a=1; sb-cdfz-auth-token=abc")).toBe(true);
    expect(hasAuthCookie("sb-cdfz-auth-token.0=abc; sb-cdfz-auth-token.1=def")).toBe(true);
    expect(hasAuthCookie("sb-cdfz-auth-token-code-verifier=abc")).toBe(false);
    expect(hasAuthCookie("")).toBe(false);
  });
});
