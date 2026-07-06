import { describe, expect, it, vi } from "vitest";
import {
  exchangeCodeForSession,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
} from "../auth/actions";
import type { SupabaseDb } from "../auth/server";

function fakeSupabase(overrides: Record<string, unknown> = {}) {
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  return { client: { auth } as unknown as SupabaseDb, auth };
}

describe("signInWithMagicLink", () => {
  it("sends an OTP email with the callback redirect", async () => {
    const { client, auth } = fakeSupabase();
    const result = await signInWithMagicLink(client, {
      email: "seller@example.com",
      redirectTo: "http://localhost:3001/auth/callback",
    });
    expect(result.error).toBeNull();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "seller@example.com",
      options: { emailRedirectTo: "http://localhost:3001/auth/callback" },
    });
  });

  it("surfaces the supabase error message", async () => {
    const { client } = fakeSupabase({
      signInWithOtp: vi.fn().mockResolvedValue({ error: { message: "rate limited" } }),
    });
    expect((await signInWithMagicLink(client, { email: "x@y.z", redirectTo: "/" })).error).toBe(
      "rate limited",
    );
  });
});

describe("signInWithGoogle", () => {
  it("returns the provider consent URL", async () => {
    const { client, auth } = fakeSupabase();
    const result = await signInWithGoogle(client, { redirectTo: "http://localhost:3000/auth/callback" });
    expect(result).toEqual({ url: "https://accounts.google.com/x", error: null });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    });
  });
});

describe("signOut / exchangeCodeForSession", () => {
  it("wrap their supabase calls", async () => {
    const { client, auth } = fakeSupabase();
    expect((await signOut(client)).error).toBeNull();
    expect((await exchangeCodeForSession(client, "code-123")).error).toBeNull();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("code-123");
  });
});
