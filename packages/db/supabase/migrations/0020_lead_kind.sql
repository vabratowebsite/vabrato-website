-- S5 PR 5: open-house sign-ins are leads (kind open_house_signin). In its own
-- migration because a new enum value can't be used in the transaction that
-- adds it (0021 uses it).

alter type public.lead_kind add value if not exists 'open_house_signin';
