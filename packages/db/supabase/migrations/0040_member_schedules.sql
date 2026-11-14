-- S5b PR 5: schedules (owner answers 2026-11-14).
--
-- - ai_member_moving (off): a moving plan. A seller's plan is anchored on the
--   closing and rent-back dates from the schedule engine (dates of record,
--   "confirm with your agent"); a buyer types their move date.
-- - ai_member_prelisting (off): a pre-listing checklist counted back from a
--   list date the seller types.
-- - ai_member_tour (off): a tour-day plan. Our code orders the homes (open
--   houses first, then straight-line distance); the model adds notes from the
--   listing facts, so it needs the MLSListings approval switch (0039) too.
-- - member_todos.due_date: a member adds plan items to "My to-dos" with their
--   dates. They still wait for the agent's approval (0037). The deal's own
--   deadlines stay in the schedule engine and are never changed here.

insert into public.feature_flags (key, description) values
  ('ai_member_moving', 'Ask Vabrato: a moving plan for a member, anchored on their sale''s closing date from the schedule engine, or a move date a buyer types. The member adds items to their to-dos; their agent approves them.'),
  ('ai_member_prelisting', 'Ask Vabrato: a pre-listing checklist for a seller, counted back from a list date they type. Items go to their to-dos for their agent''s approval.'),
  ('ai_member_tour', 'Ask Vabrato: a tour-day plan. Our code orders the member''s chosen homes; the assistant adds what to look at in each from the listing. Needs ai_mls_approved.')
on conflict (key) do nothing;

-- The MLSListings approval now also covers the tour-day switch.
create or replace function public.feature_flags_mls_ai_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key in ('ai_member_compare', 'ai_member_listing', 'ai_member_tour') and new.enabled and not old.enabled
     and not coalesce((select enabled from feature_flags where key = 'ai_mls_approved'), false) then
    raise exception 'mls_ai_not_approved' using errcode = '42501',
      hint = 'Record MLSListings'' written approval of AI on listing data first (ai_mls_approved).';
  end if;
  return new;
end;
$$;

create or replace function public.feature_flags_mls_ai_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'ai_mls_approved' and old.enabled and not new.enabled then
    update feature_flags set enabled = false, updated_at = now()
     where key in ('ai_member_compare', 'ai_member_listing', 'ai_member_tour') and enabled;
  end if;
  return null;
end;
$$;

revoke execute on function public.feature_flags_mls_ai_gate() from public, anon, authenticated;
revoke execute on function public.feature_flags_mls_ai_off() from public, anon, authenticated;

-- A plan item's date, when the member adds it to their to-dos.
alter table public.member_todos
  add column due_date date check (due_date between date '2000-01-01' and date '2100-12-31');

grant insert (due_date) on public.member_todos to authenticated;
