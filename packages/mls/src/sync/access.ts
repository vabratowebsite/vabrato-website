import type { PgSyncStore } from "./store";

// ACC-1: FULL data only for signed-in agents verified as active MLSListings
// members of our office (Member resource, office from MLS_OFFICE_ID).
// - verifyAgentAccess: call at every console sign-in (wired up in S6).
// - recheckAgentAccess: runs in the nightly reconcile after the roster sync.
// has_full_mls_access() also requires a verification within 36 hours, so
// access lapses on its own if the nightly job stops running.

export async function verifyAgentAccess(
  store: PgSyncStore,
  args: { profileId: string; email: string; officeId: string; now?: Date },
): Promise<{ verified: boolean; memberKey: string | null }> {
  const member = await store.findActiveMember(args.email, args.officeId);
  if (member) {
    await store.setAgentAccess(args.profileId, member.member_key, true, args.now ?? new Date());
    return { verified: true, memberKey: member.member_key };
  }
  const existing = (await store.listAgentAccess()).find((a) => a.profile_id === args.profileId);
  if (existing?.active) await store.setAgentAccess(args.profileId, existing.member_key, false, null);
  return { verified: false, memberKey: null };
}

export async function recheckAgentAccess(
  store: PgSyncStore,
  args: { officeId: string; now?: Date },
): Promise<{ checked: number; locked: number; renewed: number }> {
  const rows = await store.listAgentAccess();
  const members = await store.membersByKey(rows.map((r) => r.member_key));
  let locked = 0;
  let renewed = 0;
  for (const row of rows) {
    const m = members.get(row.member_key);
    const ok = m?.member_status === "Active" && m.office_mls_id === args.officeId;
    if (ok) {
      // Only previously-active rows are renewed; a locked agent must sign in again (S6).
      if (row.active) {
        await store.setAgentAccess(row.profile_id, row.member_key, true, args.now ?? new Date());
        renewed++;
      }
    } else if (row.active) {
      await store.setAgentAccess(row.profile_id, row.member_key, false, null);
      locked++;
    }
  }
  return { checked: rows.length, locked, renewed };
}
