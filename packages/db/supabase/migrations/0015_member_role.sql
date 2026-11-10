-- S5: members are buyer, seller or both (SPEC G3). A new enum value can't be
-- used in the same transaction that adds it, so it gets its own migration;
-- 0016 uses it.
alter type public.user_role add value if not exists 'both' after 'buyer';
