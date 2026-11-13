-- S6b PR 7c: what changed in a counter-offer or addendum, and "Check
-- unchecked documents".
--
-- - Counter-offer changes: the assistant reads one file typed as a counter
--   offer or addendum and lists the terms it sets; our code compares them
--   with the deal's recorded terms. Shown only: nothing is stored and the
--   deal's terms are never changed. Its own switch, off.
-- - Document checks are now recorded on the file: when, by whom, the signed
--   answer and how many things to look at (never the issue text). "Check
--   unchecked documents" runs the existing check (ai_staff_document_check)
--   on files never checked, up to 10 per click.
--
-- The 0032 policies apply (staff with access to the deal). A trigger stamps
-- checked_at and checked_by itself, so a client can't backdate a check or
-- record it in someone else's name.

insert into public.feature_flags (key, description) values
  ('ai_staff_counter_changes', 'VA assistant: reads one counter offer or addendum from a deal''s documents and shows which terms it sets, compared with the deal''s recorded terms. Shown only; the deal''s terms are not changed.')
on conflict (key) do nothing;

alter table public.deal_documents
  add column checked_at timestamptz,
  add column checked_by uuid references public.profiles (id) on delete set null,
  add column check_signed text check (check_signed in ('yes', 'no', 'unclear', 'not_applicable')),
  add column check_issue_count smallint check (check_issue_count between 0 and 10),
  add constraint deal_documents_check_complete check ((checked_at is null) = (check_signed is null) and (checked_at is null) = (check_issue_count is null));

alter table public.deal_member_document_types
  add column checked_at timestamptz,
  add column checked_by uuid references public.profiles (id) on delete set null,
  add column check_signed text check (check_signed in ('yes', 'no', 'unclear', 'not_applicable')),
  add column check_issue_count smallint check (check_issue_count between 0 and 10),
  add constraint deal_member_document_types_check_complete check ((checked_at is null) = (check_signed is null) and (checked_at is null) = (check_issue_count is null));

-- Any change to the check columns is a new check: stamped now, by the caller.
-- A recorded check can't be cleared (both answers are required).
create function public.stamp_document_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.checked_at is null and new.checked_by is null and new.check_signed is null and new.check_issue_count is null then
      return new;
    end if;
  elsif new.checked_at is not distinct from old.checked_at
    and new.checked_by is not distinct from old.checked_by
    and new.check_signed is not distinct from old.check_signed
    and new.check_issue_count is not distinct from old.check_issue_count then
    return new;
  end if;
  if new.check_signed is null or new.check_issue_count is null then
    raise exception 'check_incomplete' using errcode = '23514';
  end if;
  new.checked_at := now();
  new.checked_by := auth.uid();
  return new;
end;
$$;

create trigger deal_documents_stamp_check
  before insert or update on public.deal_documents
  for each row execute function public.stamp_document_check();

create trigger deal_member_document_types_stamp_check
  before insert or update on public.deal_member_document_types
  for each row execute function public.stamp_document_check();

grant update (check_signed, check_issue_count, checked_at) on public.deal_documents to authenticated;
grant insert (check_signed, check_issue_count) on public.deal_member_document_types to authenticated;
grant update (check_signed, check_issue_count, checked_at) on public.deal_member_document_types to authenticated;
