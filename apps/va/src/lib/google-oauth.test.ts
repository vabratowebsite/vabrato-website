import { describe, expect, it } from "vitest";
import { CONNECT_MESSAGES, readOAuthCookie, sameState } from "./google-oauth";

// Integrations PR 1: the one-time state of a Google connection in progress.

const ok = { state: "s".repeat(32), verifier: "v".repeat(43), profileId: "c1000000-0000-4000-8000-0000000042c1", purpose: "calendar" as const };

describe("the Google connection cookie", () => {
  it("reads a well-formed cookie", () => {
    expect(readOAuthCookie(JSON.stringify(ok))).toEqual(ok);
    expect(readOAuthCookie(JSON.stringify({ ...ok, purpose: "dropbox" }))?.purpose).toBe("dropbox");
    // An unknown purpose falls back to Calendar, never anything wider.
    expect(readOAuthCookie(JSON.stringify({ ...ok, purpose: "everything" }))?.purpose).toBe("calendar");
  });

  it("refuses anything else", () => {
    expect(readOAuthCookie(undefined)).toBeNull();
    expect(readOAuthCookie("not json")).toBeNull();
    expect(readOAuthCookie(JSON.stringify({ ...ok, state: "short" }))).toBeNull();
    expect(readOAuthCookie(JSON.stringify({ ...ok, verifier: "has spaces in it ".repeat(4) }))).toBeNull();
    expect(readOAuthCookie(JSON.stringify({ state: ok.state, verifier: ok.verifier }))).toBeNull();
    expect(readOAuthCookie("x".repeat(2000))).toBeNull();
  });

  it("compares the state exactly", () => {
    expect(sameState(ok.state, ok.state)).toBe(true);
    expect(sameState(null, ok.state)).toBe(false);
    expect(sameState(`${ok.state}x`, ok.state)).toBe(false);
    expect(sameState("t".repeat(32), ok.state)).toBe(false);
  });

  it("every result Settings can show has a message, and none name a token", () => {
    expect(Object.keys(CONNECT_MESSAGES).sort()).toEqual(["connected", "denied", "disconnected", "disconnected_partial", "drive_connected", "dropbox_connected", "dropbox_disconnected", "dropbox_disconnected_partial", "expired", "failed", "not_ready", "unverified"]);
    expect(JSON.stringify(CONNECT_MESSAGES)).not.toMatch(/token|secret|password/i);
  });
});
