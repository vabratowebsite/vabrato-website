-- S5b PR 3: member drafts (owner answers 2026-11-14).
--
-- - ai_member_draft (off): Ask Vabrato drafts an email or message for a
--   buyer or seller (movers, a contractor, the lender, their agent, someone
--   else). The member edits and sends it themselves; AI never sends.
-- - ai_member_cover_letter (off): a buyer's offer cover letter about the
--   offer's terms only. It goes to the agent only ("Send to my agent").
-- - member_drafts: drafts the member chooses to save. Private to the member:
--   no staff policy, so their agent and admins never see them. Each is
--   deleted 30 days after its last edit (daily purge), or sooner by the
--   member. "Delete my assistant data" removes them all.

insert into public.feature_flags (key, description) values
  ('ai_member_draft', 'Ask Vabrato: drafts an email or message for a member (movers, contractor, lender, their agent). The member edits and sends it; AI never sends. Saved drafts are private and deleted 30 days after the last edit.'),
  ('ai_member_cover_letter', 'Ask Vabrato: a buyer''s offer cover letter about the offer''s terms only (no personal or family details). It goes to the agent only.')
on conflict (key) do nothing;

create table public.member_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message', 'cover_letter')),
  recipient text not null check (recipient in ('movers', 'contractor', 'lender', 'agent', 'other')),
  about text check (char_length(about) between 1 and 200),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 3500),
  sent_via text check (sent_via in ('email', 'copy', 'agent')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'message' or recipient = 'agent'),
  check ((sent_via is null) = (used_at is null)),
  check (kind = 'message' or sent_via is null or sent_via = 'agent')
);

create index member_drafts_profile_idx on public.member_drafts (profile_id, updated_at desc);
create index member_drafts_updated_idx on public.member_drafts (updated_at);

alter table public.member_drafts enable row level security;

create policy "member_drafts: the member reads their own"
  on public.member_drafts for select to authenticated
  using (profile_id = auth.uid());

create policy "member_drafts: the member saves their own"
  on public.member_drafts for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('buyer', 'seller', 'both')
        and (member_drafts.kind = 'message' or role in ('buyer', 'both'))
    )
  );

create policy "member_drafts: the member edits their own"
  on public.member_drafts for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "member_drafts: the member deletes their own"
  on public.member_drafts for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.member_drafts from anon, authenticated;
grant select, delete on public.member_drafts to authenticated;
grant insert (kind, recipient, about, subject, body) on public.member_drafts to authenticated;
grant update (subject, body, sent_via) on public.member_drafts to authenticated;

-- Fixed fields, the edit clock and the used stamp; at most 50 per member.
create function public.member_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('member_drafts:' || new.profile_id::text, 0));
    if (select count(*) from member_drafts where profile_id = new.profile_id) >= 50 then
      raise exception 'too_many_drafts' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.used_at := case when new.sent_via is null then null else now() end;
    return new;
  end if;
  if new.profile_id <> old.profile_id or new.kind <> old.kind or new.recipient <> old.recipient
     or new.about is distinct from old.about or new.created_at <> old.created_at then
    raise exception 'draft_fixed_fields' using errcode = 'P0001';
  end if;
  if new.subject is distinct from old.subject or new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  if new.sent_via is null then
    new.used_at := null;
  elsif new.sent_via is distinct from old.sent_via or old.used_at is null then
    new.used_at := now();
  else
    new.used_at := old.used_at;
  end if;
  return new;
end;
$$;

create trigger member_drafts_guard before insert or update on public.member_drafts
  for each row execute function public.member_drafts_guard();

-- Daily: drafts not edited for 30 days.
create function public.purge_member_drafts()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from member_drafts where updated_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from gone;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('vabrato-purge-member-drafts', '47 11 * * *', 'select public.purge_member_drafts()')$q$;
  end if;
end;
$$;

-- "Delete my assistant data": the caller's drafts, and their waiting and
-- declined to-dos (approved to-dos stay until the member deletes them).
create or replace function public.delete_my_assistant_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  d integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from member_todos where profile_id = auth.uid() and status in ('pending', 'declined');
  get diagnostics n = row_count;
  delete from member_drafts where profile_id = auth.uid();
  get diagnostics d = row_count;
  return n + d;
end;
$$;

revoke execute on function public.member_drafts_guard() from public, anon, authenticated;
revoke execute on function public.purge_member_drafts() from public, anon, authenticated;
revoke execute on function public.delete_my_assistant_data() from public, anon;
grant execute on function public.delete_my_assistant_data() to authenticated;
