import { buildFixtures, FIXTURE_NOW, type FixtureSet } from "../fixtures";
import { RESOURCE_KEYS, type ResourceName } from "../resources";

// Mutable in-memory state behind the mock RESO server. Tests change it to
// simulate a live feed: price changes, status changes, opt-outs, deletions.

type Rec = Record<string, unknown>;

const STORE: Record<ResourceName, keyof FixtureSet> = {
  Property: "properties",
  Media: "media",
  OpenHouse: "openHouses",
  Member: "members",
  Office: "offices",
};

export class MockFeed {
  private data: FixtureSet;
  /** Feed clock; every change stamps ModificationTimestamp from it. */
  now: Date;

  constructor(fixtures: FixtureSet = buildFixtures(), now: Date = FIXTURE_NOW) {
    this.data = fixtures;
    this.now = new Date(now);
  }

  records(resource: ResourceName): Rec[] {
    return this.data[STORE[resource]] as Rec[];
  }

  find(resource: ResourceName, key: string): Rec | undefined {
    return this.records(resource).find((r) => r[RESOURCE_KEYS[resource]] === key);
  }

  /** Advance the feed clock. */
  tick(minutes = 1): Date {
    this.now = new Date(this.now.getTime() + minutes * 60_000);
    return this.now;
  }

  /** Patch a record and bump its ModificationTimestamp, as the MLS would. */
  update(resource: ResourceName, key: string, patch: Rec): Rec {
    const rec = this.find(resource, key);
    if (!rec) throw new Error(`No ${resource} ${key} in mock feed`);
    Object.assign(rec, patch, { ModificationTimestamp: this.tick().toISOString() });
    return rec;
  }

  add(resource: ResourceName, rec: Rec): void {
    this.records(resource).push({ ...rec, ModificationTimestamp: this.tick().toISOString() });
  }

  /** Hard delete: the record simply disappears from the feed (only a reconcile notices). */
  remove(resource: ResourceName, key: string): void {
    const list = this.records(resource);
    const i = list.findIndex((r) => r[RESOURCE_KEYS[resource]] === key);
    if (i >= 0) list.splice(i, 1);
  }
}
