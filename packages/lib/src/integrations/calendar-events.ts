import { createHash } from "node:crypto";
import { pacificToUtc } from "../ics";
import { addDays } from "../holidays";
import { computeCoe, contingencyTitle } from "../schedule";
import { GoogleReconnectError, type CalendarApi, type GoogleEventBody } from "./google";

// What the console puts on a staff member's Google Calendar (Integrations
// PR 1, owner answer 2026-11-14): their approved appointments, and their
// deals' key dates (contingency removals, close of escrow, rent-back end).
// Pure builders plus the sync that compares them with what we put there
// before. Events are private, have no attendees and carry a key so we only
// ever touch our own. Nothing about money, wiring or the seller goes in.

const PACIFIC = "America/Los_Angeles";
const FOOTER = "Added by the Vabrato console.";

export interface EventSpec {
  sourceKey: string;
  body: GoogleEventBody;
}

export interface AppointmentInput {
  id: string;
  fields: { title: string; date: string; start: string; minutes: number; location: string; with: string };
  consoleUrl: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One approved appointment as a timed event, California time. */
export function appointmentEvent(a: AppointmentInput): EventSpec | null {
  const f = a.fields;
  if (!DATE.test(f.date) || !/^\d{2}:\d{2}$/.test(f.start) || !(f.minutes >= 5 && f.minutes <= 600)) return null;
  const start = pacificToUtc(f.date, f.start);
  const end = new Date(start.getTime() + f.minutes * 60_000);
  const lines = [f.with.trim() ? `With ${clip(f.with.trim(), 120)}.` : "", `Open in the console: ${a.consoleUrl}/appointments/${a.id}`, FOOTER].filter(Boolean);
  return {
    sourceKey: `appt:${a.id}`,
    body: {
      summary: clip(f.title.trim() || "Appointment", 200),
      description: lines.join("\n"),
      ...(f.location.trim() ? { location: clip(f.location.trim(), 300) } : {}),
      start: { dateTime: start.toISOString(), timeZone: PACIFIC },
      end: { dateTime: end.toISOString(), timeZone: PACIFIC },
      visibility: "private",
      transparency: "opaque",
      reminders: { useDefault: true },
      extendedProperties: { private: { vabratoKey: `appt:${a.id}` } },
    },
  };
}

export interface DealInput {
  id: string;
  address: string;
  status: "active" | "closed" | "cancelled";
  ratification_date: string;
  days_to_close: number;
  rent_back_days: number;
}

function allDay(sourceKey: string, title: string, date: string, url: string): EventSpec {
  return {
    sourceKey,
    body: {
      summary: clip(title, 200),
      description: `Open the deal in the console: ${url}\n${FOOTER}`,
      start: { date },
      end: { date: addDays(date, 1) },
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: true },
      extendedProperties: { private: { vabratoKey: sourceKey } },
    },
  };
}

/**
 * A deal's key dates as all-day events: each contingency removal (its stored
 * due date), close of escrow and the end of a rent-back. A cancelled deal has
 * none, so a sync removes them; a closed deal keeps its past dates.
 */
export function keyDateEvents(d: DealInput, contingencies: { kind: string; due_date: string | null }[], consoleUrl: string): EventSpec[] {
  if (d.status === "cancelled" || !DATE.test(d.ratification_date) || !(d.days_to_close >= 1)) return [];
  const url = `${consoleUrl}/deals/${d.id}`;
  const place = clip(d.address.trim(), 120);
  const out: EventSpec[] = [];
  for (const c of contingencies) {
    if (!c.due_date || !DATE.test(c.due_date) || !/^[a-z_]{1,40}$/.test(c.kind)) continue;
    out.push(allDay(`deal:${d.id}:cr:${c.kind}`, `${contingencyTitle(c.kind)} · ${place}`, c.due_date, url));
  }
  const coe = computeCoe(d.ratification_date, d.days_to_close);
  out.push(allDay(`deal:${d.id}:coe`, `Close of escrow · ${place}`, coe, url));
  if (d.rent_back_days > 0) out.push(allDay(`deal:${d.id}:rentback`, `Rent-back ends · ${place}`, addDays(coe, d.rent_back_days), url));
  return out;
}

/** A stable hash of what we send, to know when an event needs updating. */
export function eventHash(body: GoogleEventBody): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
  return createHash("sha256").update(JSON.stringify(sort(body))).digest("hex");
}

export interface StoredEvent {
  source_key: string;
  google_event_id: string;
  content_hash: string;
}

export interface SyncPlan {
  create: EventSpec[];
  update: { spec: EventSpec; eventId: string }[];
  remove: { sourceKey: string; eventId: string }[];
}

/** What to create, update and remove to make the calendar match `desired`. */
export function planSync(desired: EventSpec[], stored: StoredEvent[]): SyncPlan {
  const have = new Map(stored.map((s) => [s.source_key, s]));
  const want = new Map(desired.map((d) => [d.sourceKey, d]));
  const plan: SyncPlan = { create: [], update: [], remove: [] };
  for (const [key, spec] of want) {
    const s = have.get(key);
    if (!s) plan.create.push(spec);
    else if (s.content_hash !== eventHash(spec.body)) plan.update.push({ spec, eventId: s.google_event_id });
  }
  for (const [key, s] of have) if (!want.has(key)) plan.remove.push({ sourceKey: key, eventId: s.google_event_id });
  return plan;
}

export const MAX_CHANGES_PER_SYNC = 200;

export interface SyncOutcome {
  /** Rows to upsert into calendar_events. */
  saved: StoredEvent[];
  /** Source keys whose rows to delete. */
  removed: string[];
  failed: number;
  /** More changes were waiting than one sync makes. */
  capped: boolean;
  /** Google refused the token: stop and ask the person to reconnect. */
  reconnect: boolean;
}

/**
 * Applies a plan through the Calendar API, removals first, at most
 * MAX_CHANGES_PER_SYNC changes. An event the person deleted in Google is made
 * again on update. A refused token stops the run.
 */
export async function runSync(plan: SyncPlan, api: CalendarApi, max = MAX_CHANGES_PER_SYNC): Promise<SyncOutcome> {
  const out: SyncOutcome = { saved: [], removed: [], failed: 0, capped: false, reconnect: false };
  const steps: (() => Promise<void>)[] = [
    ...plan.remove.map((r) => async () => {
      await api.remove(r.eventId);
      out.removed.push(r.sourceKey);
    }),
    ...plan.update.map((u) => async () => {
      const hash = eventHash(u.spec.body);
      const res = await api.update(u.eventId, u.spec.body);
      const id = res === "gone" ? await api.create(u.spec.body) : u.eventId;
      out.saved.push({ source_key: u.spec.sourceKey, google_event_id: id, content_hash: hash });
    }),
    ...plan.create.map((c) => async () => {
      const id = await api.create(c.body);
      out.saved.push({ source_key: c.sourceKey, google_event_id: id, content_hash: eventHash(c.body) });
    }),
  ];
  out.capped = steps.length > max;
  for (const step of steps.slice(0, max)) {
    try {
      await step();
    } catch (e) {
      if (e instanceof GoogleReconnectError) {
        out.reconnect = true;
        break;
      }
      out.failed++;
    }
  }
  return out;
}
