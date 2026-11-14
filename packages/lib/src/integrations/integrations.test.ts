import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appointmentEvent, eventHash, keyDateEvents, MAX_CHANGES_PER_SYNC, planSync, runSync, type EventSpec } from "./calendar-events";
import { decryptToken, encryptToken, tokenKey, TokenDecryptError, TokenKeyError } from "./crypto";
import { createFakeGoogle, fakeFetch } from "./fake-google";
import { accessTokenFor, accountEmail, calendarApi, consentUrl, exchangeCode, GoogleError, GoogleReconnectError, googleSetup, newPkce, newState, pkceChallenge, revokeToken, type GoogleSetup } from "./google";

// Integrations PR 1: token encryption, the Google OAuth and Calendar client
// against the fake, the events we build and the sync. Fictional data only.

const KEY_B64 = randomBytes(32).toString("base64");
const ENV = {
  GOOGLE_INTEGRATION_CLIENT_ID: "fake-client.apps.example.test",
  GOOGLE_INTEGRATION_CLIENT_SECRET: "fake-secret",
  INTEGRATIONS_TOKEN_KEY: KEY_B64,
  GOOGLE_ACCOUNTS_BASE_URL: "http://fake-google.test",
  GOOGLE_OAUTH_BASE_URL: "http://fake-google.test",
  GOOGLE_API_BASE_URL: "http://fake-google.test/",
};
const setupOf = (env: Record<string, string | undefined> = ENV): GoogleSetup => {
  const s = googleSetup(env);
  if (!s.ok) throw new Error(s.missing.join());
  return s.setup;
};
const REDIRECT = "http://console.test/integrations/google/callback";

describe("token encryption", () => {
  const key = tokenKey(KEY_B64);

  it("round-trips, with a fresh IV each time", () => {
    const a = encryptToken("1//fake-refresh-token", key);
    const b = encryptToken("1//fake-refresh-token", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain("fake-refresh-token");
    expect(decryptToken(a, key)).toBe("1//fake-refresh-token");
  });

  it("refuses a changed ciphertext, tag or version, and the wrong key", () => {
    const c = encryptToken("1//fake-refresh-token", key);
    const [v, iv, body, tag] = c.split(".") as [string, string, string, string];
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(() => decryptToken([v, iv, flip(body), tag].join("."), key)).toThrow(TokenDecryptError);
    expect(() => decryptToken([v, iv, body, flip(tag)].join("."), key)).toThrow(TokenDecryptError);
    expect(() => decryptToken([v, iv, body, tag.slice(0, 8)].join("."), key)).toThrow(TokenDecryptError);
    expect(() => decryptToken(["v2", iv, body, tag].join("."), key)).toThrow(TokenDecryptError);
    expect(() => decryptToken(c, tokenKey(randomBytes(32).toString("base64")))).toThrow(TokenDecryptError);
    expect(() => decryptToken("not-a-token", key)).toThrow(TokenDecryptError);
  });

  it("needs a 32-byte key, and the error names no value", () => {
    expect(() => tokenKey(undefined)).toThrow(TokenKeyError);
    expect(() => tokenKey(randomBytes(16).toString("base64"))).toThrow(TokenKeyError);
    expect(() => tokenKey("not base64 at all!")).toThrow(TokenKeyError);
    expect(tokenKey(randomBytes(32).toString("base64url"))).toHaveLength(32);
    try {
      tokenKey("c2hvcnQ=");
    } catch (e) {
      expect((e as Error).message).not.toContain("c2hvcnQ");
    }
  });
});

describe("Google setup", () => {
  it("names what's missing, never values", () => {
    expect(googleSetup({})).toEqual({ ok: false, missing: ["GOOGLE_INTEGRATION_CLIENT_ID", "GOOGLE_INTEGRATION_CLIENT_SECRET", "INTEGRATIONS_TOKEN_KEY"] });
    expect(googleSetup({ ...ENV, INTEGRATIONS_TOKEN_KEY: "short" })).toEqual({ ok: false, missing: ["INTEGRATIONS_TOKEN_KEY"] });
  });

  it("defaults to Google's own addresses", () => {
    const s = setupOf({ GOOGLE_INTEGRATION_CLIENT_ID: "x", GOOGLE_INTEGRATION_CLIENT_SECRET: "y", INTEGRATIONS_TOKEN_KEY: KEY_B64 });
    expect([s.accountsBase, s.oauthBase, s.apiBase]).toEqual(["https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com"]);
    expect(setupOf().apiBase).toBe("http://fake-google.test");
  });

  it("asks for offline Calendar events access with PKCE and our state", () => {
    const { challenge } = newPkce();
    const url = new URL(consentUrl(setupOf(), { redirectUri: REDIRECT, state: "st", challenge }));
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: ENV.GOOGLE_INTEGRATION_CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: "openid email https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      state: "st",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(url.toString()).not.toContain(ENV.GOOGLE_INTEGRATION_CLIENT_SECRET);
    expect(newState()).not.toBe(newState());
  });
});

/** Runs the consent step against the fake and returns the code it redirects with. */
async function consent(g: ReturnType<typeof createFakeGoogle>, challenge: string, state = "st"): Promise<string> {
  const res = await g.handle(new Request(consentUrl(setupOf(), { redirectUri: REDIRECT, state, challenge })));
  const to = new URL(res.headers.get("location")!);
  expect(to.searchParams.get("state")).toBe(state);
  return to.searchParams.get("code")!;
}

describe("Google OAuth against the fake", () => {
  it("exchanges the code with the right verifier, then refreshes and revokes", async () => {
    const g = createFakeGoogle({ email: "Agent@Example.test" });
    const f = fakeFetch(g);
    const s = setupOf();
    const { verifier, challenge } = newPkce();
    const code = await consent(g, challenge);
    const t = await exchangeCode(s, { code, verifier, redirectUri: REDIRECT }, f);
    expect(t.scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(await accountEmail(s, t.accessToken, f)).toEqual({ email: "agent@example.test", verified: true });
    const fresh = await accessTokenFor(s, t.refreshToken, f);
    expect(fresh).not.toBe(t.accessToken);
    await revokeToken(s, t.refreshToken, f);
    await expect(accessTokenFor(s, t.refreshToken, f)).rejects.toThrow(GoogleReconnectError);
    await revokeToken(s, t.refreshToken, f); // already revoked: fine
    expect(JSON.stringify(g.log)).not.toContain(t.refreshToken);
  });

  it("refuses a wrong verifier or a reused code", async () => {
    const g = createFakeGoogle();
    const f = fakeFetch(g);
    const { verifier, challenge } = newPkce();
    const code = await consent(g, challenge);
    await expect(exchangeCode(setupOf(), { code, verifier: newPkce().verifier, redirectUri: REDIRECT }, f)).rejects.toThrow(GoogleReconnectError);
    await expect(exchangeCode(setupOf(), { code, verifier, redirectUri: REDIRECT }, f)).rejects.toThrow(GoogleReconnectError);
    expect(pkceChallenge(verifier)).toBe(challenge);
  });

  it("reports an unverified email", async () => {
    const g = createFakeGoogle({ emailVerified: false });
    const f = fakeFetch(g);
    const { verifier, challenge } = newPkce();
    const t = await exchangeCode(setupOf(), { code: await consent(g, challenge), verifier, redirectUri: REDIRECT }, f);
    expect((await accountEmail(setupOf(), t.accessToken, f)).verified).toBe(false);
  });

  it("an unreachable Google is a GoogleError with no details", async () => {
    const down = (async () => {
      throw new Error("connect ECONNREFUSED with secrets");
    }) as unknown as typeof fetch;
    await expect(accessTokenFor(setupOf(), "1//x", down)).rejects.toEqual(new GoogleError(0));
  });
});

const CONSOLE = "https://console.example.test";
const APPT_ID = "a1000000-0000-4000-8000-0000000042a1";
const DEAL = { id: "d1000000-0000-4000-8000-0000000042d1", address: "1 Fixture Way, Belmont", status: "active" as const, ratification_date: "2026-11-02", days_to_close: 30, rent_back_days: 3 };

describe("the events we build", () => {
  it("an appointment is a private timed event in California time, daylight saving included", () => {
    const summer = appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { title: "Final walkthrough", date: "2026-07-14", start: "15:00", minutes: 45, location: "1 Fixture Way, Belmont", with: "Dana" } })!;
    expect(summer.sourceKey).toBe(`appt:${APPT_ID}`);
    expect(summer.body.start).toEqual({ dateTime: "2026-07-14T22:00:00.000Z", timeZone: "America/Los_Angeles" });
    expect(summer.body.end).toEqual({ dateTime: "2026-07-14T22:45:00.000Z", timeZone: "America/Los_Angeles" });
    const winter = appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { title: "Walkthrough", date: "2026-11-17", start: "09:30", minutes: 60, location: "", with: "" } })!;
    expect(winter.body.start).toEqual({ dateTime: "2026-11-17T17:30:00.000Z", timeZone: "America/Los_Angeles" });
    expect(winter.body).not.toHaveProperty("location");
    expect(summer.body).toMatchObject({ visibility: "private", extendedProperties: { private: { vabratoKey: `appt:${APPT_ID}` } } });
    expect(summer.body.description).toContain(`${CONSOLE}/appointments/${APPT_ID}`);
    expect(summer.body.description).toContain("Added by the Vabrato console.");
    expect(summer.body).not.toHaveProperty("attendees");
  });

  it("refuses an appointment with bad fields", () => {
    const f = { title: "x", date: "2026-11-17", start: "09:30", minutes: 60, location: "", with: "" };
    expect(appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { ...f, date: "17/11/2026" } })).toBeNull();
    expect(appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { ...f, minutes: 0 } })).toBeNull();
  });

  it("a deal's key dates: contingency removals, close of escrow (never a weekend or holiday) and the rent-back end", () => {
    const ev = keyDateEvents(DEAL, [{ kind: "property_condition", due_date: "2026-11-10" }, { kind: "financing", due_date: null }], CONSOLE);
    expect(ev.map((e) => [e.sourceKey, e.body.summary, e.body.start])).toEqual([
      [`deal:${DEAL.id}:cr:property_condition`, "Property-condition contingency removal · 1 Fixture Way, Belmont", { date: "2026-11-10" }],
      // 2026-11-02 + 30 = Wed 2 Dec 2026, a business day.
      [`deal:${DEAL.id}:coe`, "Close of escrow · 1 Fixture Way, Belmont", { date: "2026-12-02" }],
      [`deal:${DEAL.id}:rentback`, "Rent-back ends · 1 Fixture Way, Belmont", { date: "2026-12-05" }],
    ]);
    expect(ev[1]!.body.end).toEqual({ date: "2026-12-03" });
    expect(ev.every((e) => e.body.transparency === "transparent" && e.body.visibility === "private")).toBe(true);
    expect(JSON.stringify(ev)).not.toMatch(/\$|price|wire|seller/i);
  });

  it("close of escrow rolls off Thanksgiving; a cancelled deal has no dates; a closed deal keeps them", () => {
    // 2026-10-27 + 30 = Thu 26 Nov 2026 (Thanksgiving) → Fri 27 Nov.
    const coe = keyDateEvents({ ...DEAL, ratification_date: "2026-10-27", rent_back_days: 0 }, [], CONSOLE);
    expect(coe.map((e) => e.body.start)).toEqual([{ date: "2026-11-27" }]);
    expect(keyDateEvents({ ...DEAL, status: "cancelled" }, [], CONSOLE)).toEqual([]);
    expect(keyDateEvents({ ...DEAL, status: "closed" }, [], CONSOLE)).toHaveLength(2);
  });

  it("the hash changes with the content, not the key order", () => {
    const a = appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { title: "A", date: "2026-11-17", start: "09:30", minutes: 60, location: "", with: "" } })!;
    const reordered = JSON.parse(JSON.stringify(a.body, Object.keys(a.body).sort().reverse()));
    expect(eventHash({ ...reordered, start: a.body.start, end: a.body.end, reminders: a.body.reminders, extendedProperties: a.body.extendedProperties })).toBe(eventHash(a.body));
    expect(eventHash({ ...a.body, summary: "B" })).not.toBe(eventHash(a.body));
    expect(eventHash(a.body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the sync", () => {
  const appt = (title: string) => appointmentEvent({ id: APPT_ID, consoleUrl: CONSOLE, fields: { title, date: "2026-11-17", start: "09:30", minutes: 60, location: "", with: "" } })!;

  async function connected(email = "agent@example.test") {
    const g = createFakeGoogle({ email });
    const f = fakeFetch(g);
    const { verifier, challenge } = newPkce();
    const t = await exchangeCode(setupOf(), { code: await consent(g, challenge), verifier, redirectUri: REDIRECT }, f);
    return { g, f, api: calendarApi(setupOf(), t.accessToken, f) };
  }

  it("creates, then changes nothing on a second run, then updates and removes", async () => {
    const { g, api } = await connected();
    const desired: EventSpec[] = [appt("Walkthrough"), ...keyDateEvents(DEAL, [], CONSOLE)];
    const first = await runSync(planSync(desired, []), api);
    expect(first).toMatchObject({ failed: 0, capped: false, reconnect: false, removed: [] });
    expect(first.saved).toHaveLength(3);
    expect(g.events()).toHaveLength(3);
    expect(planSync(desired, first.saved)).toEqual({ create: [], update: [], remove: [] });

    const next = [appt("Walkthrough, moved"), ...keyDateEvents({ ...DEAL, rent_back_days: 0 }, [], CONSOLE)];
    const plan = planSync(next, first.saved);
    expect([plan.create.length, plan.update.length, plan.remove.length]).toEqual([0, 1, 1]);
    const second = await runSync(plan, api);
    expect(second.removed).toEqual([`deal:${DEAL.id}:rentback`]);
    expect(g.events().map((e) => e.body.summary).sort()).toEqual(["Close of escrow · 1 Fixture Way, Belmont", "Walkthrough, moved"]);
  });

  it("an event the person deleted in Google is made again on update; removing one already gone is fine", async () => {
    const { g, api } = await connected();
    const first = await runSync(planSync([appt("A")], []), api);
    await Promise.all(g.events().map((e) => g.handle(new Request(`http://fake-google.test/__fake/delete-event?id=${e.id}`, { method: "POST" }))));
    const again = await runSync(planSync([appt("B")], first.saved), api);
    expect(again.failed).toBe(0);
    expect(again.saved[0]!.google_event_id).not.toBe(first.saved[0]!.google_event_id);
    const gone = await runSync(planSync([], [{ source_key: "appt:x", google_event_id: "evt-missing", content_hash: "a".repeat(64) }]), api);
    expect(gone).toMatchObject({ removed: ["appt:x"], failed: 0 });
  });

  it("stops at the cap and says so", async () => {
    const { api } = await connected();
    const many = Array.from({ length: MAX_CHANGES_PER_SYNC + 5 }, (_, i) =>
      appointmentEvent({ id: `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, consoleUrl: CONSOLE, fields: { title: `A${i}`, date: "2026-11-17", start: "09:30", minutes: 30, location: "", with: "" } })!,
    );
    const out = await runSync(planSync(many, []), api);
    expect(out.capped).toBe(true);
    expect(out.saved).toHaveLength(MAX_CHANGES_PER_SYNC);
  });

  it("counts Google failures and stops when the access was revoked", async () => {
    const { g, api } = await connected();
    g.failNext(1, 503);
    const out = await runSync(planSync([appt("A"), ...keyDateEvents(DEAL, [], CONSOLE)], []), api);
    expect(out).toMatchObject({ failed: 1, reconnect: false });
    expect(out.saved).toHaveLength(2);
    g.revokeAll();
    const after = await runSync(planSync([appt("B")], out.saved), api);
    expect(after).toMatchObject({ reconnect: true, saved: [] });
  });

  it("one person's events can't be changed with another's access", async () => {
    const a = await connected("one@example.test");
    const first = await runSync(planSync([appt("A")], []), a.api);
    const { verifier, challenge } = newPkce();
    a.g.setAccount("two@example.test");
    const t = await exchangeCode(setupOf(), { code: await consent(a.g, challenge), verifier, redirectUri: REDIRECT }, a.f);
    const other = calendarApi(setupOf(), t.accessToken, a.f);
    expect(await other.update(first.saved[0]!.google_event_id, appt("Hijack").body)).toBe("gone");
    expect(a.g.events("one@example.test")[0]!.body.summary).toBe("A");
  });
});
