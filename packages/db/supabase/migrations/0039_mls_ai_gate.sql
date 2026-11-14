-- S5b PR 4: compare saved homes and ask about a home (owner answers
-- 2026-11-14). These are the first member features that send MLS listing
-- data to the model, which needs MLSListings' written approval. They're
-- built now and locked behind a separate approval switch.
--
-- - ai_mls_approved (off): an admin records that MLSListings approved AI on
--   listing data, in writing. While it's off, the two listing switches can't
--   be turned on (any way of changing them, including direct SQL); turning it
--   off turns them off.
-- - ai_member_compare (off): compares 2-4 of a member's saved homes from the
--   fields the member may see (IDX, or VOW once accepted).
-- - ai_member_listing (off): answers a member's question about one home from
--   the same fields.
-- Homes whose sellers opted out of automated valuations or consumer
-- comments (MLS-3) are never sent; that's enforced in the website's code.

insert into public.feature_flags (key, description) values
  ('ai_mls_approved', 'MLSListings has approved AI on listing data (written confirmation). Required by "Compare homes" and "Ask about a home"; turning it off turns both off.'),
  ('ai_member_compare', 'Ask Vabrato: compares 2-4 of a member''s saved homes from the listing fields they may see. Needs ai_mls_approved.'),
  ('ai_member_listing', 'Ask Vabrato: answers a member''s question about one home from the listing fields they may see. Needs ai_mls_approved.')
on conflict (key) do nothing;

create function public.feature_flags_mls_ai_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key in ('ai_member_compare', 'ai_member_listing') and new.enabled and not old.enabled
     and not coalesce((select enabled from feature_flags where key = 'ai_mls_approved'), false) then
    raise exception 'mls_ai_not_approved' using errcode = '42501',
      hint = 'Record MLSListings'' written approval of AI on listing data first (ai_mls_approved).';
  end if;
  return new;
end;
$$;

create trigger feature_flags_mls_ai_gate before update on public.feature_flags
  for each row execute function public.feature_flags_mls_ai_gate();

-- Turning the approval off turns the listing features off.
create function public.feature_flags_mls_ai_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'ai_mls_approved' and old.enabled and not new.enabled then
    update feature_flags set enabled = false, updated_at = now()
     where key in ('ai_member_compare', 'ai_member_listing') and enabled;
  end if;
  return null;
end;
$$;

create trigger feature_flags_mls_ai_off after update on public.feature_flags
  for each row execute function public.feature_flags_mls_ai_off();

revoke execute on function public.feature_flags_mls_ai_gate() from public, anon, authenticated;
revoke execute on function public.feature_flags_mls_ai_off() from public, anon, authenticated;
