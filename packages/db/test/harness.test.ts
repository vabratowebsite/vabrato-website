import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, migrationFiles, type TestDb } from "./harness";

// Sanity checks for the PGlite harness itself, using the buyer tracker table
// from 0008 (also a SEC-2 isolation check for tracked_properties).
describe("PGlite harness", () => {
  let t: TestDb;
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, a);
    await createUser(t, b);
    await t.query(`insert into tracked_properties (buyer_id, address) values ($1, '1 Example Way'), ($2, '2 Sample Ct')`, [a, b]);
  });
  afterAll(() => t.close());

  it("applies every migration in order", () => {
    const files = migrationFiles();
    expect(files[0]).toBe("0001_types.sql");
    expect(files).toEqual([...files].sort());
  });

  it("runs as the signed-in user under RLS", async () => {
    const rows = await t.as("authenticated", a, (q) => q(`select address from tracked_properties`));
    expect(rows).toEqual([{ address: "1 Example Way" }]);
  });

  it("gives signed-out visitors nothing", async () => {
    expect(await t.as("anon", null, (q) => q(`select * from tracked_properties`))).toEqual([]);
  });

  it("rolls back everything done inside as()", async () => {
    await t.as("service_role", null, (q) => q(`delete from tracked_properties`));
    expect(await t.query(`select count(*)::int as n from tracked_properties`)).toEqual([{ n: 2 }]);
  });

  it("enforces column grants (no self-service role change)", async () => {
    await expect(t.as("authenticated", a, (q) => q(`update profiles set role = 'admin' where id = $1`, [a]))).rejects.toThrow(
      /permission denied/,
    );
  });
});
