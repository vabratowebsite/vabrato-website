-- S5b PR 2: summarize a document, and "My to-dos" (owner answers 2026-11-13).
--
-- - ai_member_summarize (off): Ask Vabrato summarizes one of the member's
--   documents with page references and suggests questions and to-dos.
--   Summaries and questions aren't kept.
-- - member_todos: a to-do list in /my for buyers and sellers. The member adds
--   a to-do the assistant suggested; it waits ("pending") until their agent
--   approves or declines it in the console. Approved to-dos are the member's
--   to tick off. The deal's schedule tasks (0004) are untouched.
-- - The member's agent gets one bell alert (no email) when to-dos are added.
-- - "Delete my assistant data" removes pending and declined to-dos; approved
--   ones stay until the member deletes them.
--
-- Who sees what: the member, and staff who can see the member
-- (can_see_member, 0016). Members never see anyone else's rows. Changes
-- other than adding and deleting go through the functions below.

insert into public.feature_flags (key, description) values
  ('ai_member_summarize', 'Ask Vabrato: summarizes one of a member''s documents (50 pages at most) with page references, and suggests questions and to-dos. Summaries aren''t kept; to-dos the member adds wait for their agent''s approval.')
on conflict (key) do nothing;

create table public.member_todos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  detail text check (char_length(detail) <= 500),
  source_name text check (char_length(source_name) between 1 and 160),
  page integer check (page between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  check (done = (done_at is not null)),
  check ((status = 'pending') = (decided_at is null)),
  check (not done or status = 'approved')
);

create index member_todos_profile_idx on public.member_todos (profile_id, created_at desc);
create index member_todos_pending_idx on public.member_todos (profile_id) where status = 'pending';

alter table public.member_todos enable row level security;

create policy "member_todos: the member or their staff read"
  on public.member_todos for select to authenticated
  using (profile_id = auth.uid() or (public.is_staff() and public.can_see_member(profile_id)));

-- Only the member adds, for themselves, as a new pending to-do (column grant below).
create policy "member_todos: the member adds"
  on public.member_todos for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending' and not done
    and exists (select 1 from profiles where id = auth.uid() and role in ('buyer', 'seller', 'both'))
  );

create policy "member_todos: the member deletes their own"
  on public.member_todos for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.member_todos from anon, authenticated;
grant select, delete on public.member_todos to authenticated;
grant insert (profile_id, title, detail, source_name, page) on public.member_todos to authenticated;

-- At most 50 waiting and 300 in all, per member.
create function public.member_todos_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('member_todos:' || new.profile_id::text, 0));
  if (select count(*) from member_todos where profile_id = new.profile_id and status = 'pending') >= 50 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;
  if (select count(*) from member_todos where profile_id = new.profile_id) >= 300 then
    raise exception 'too_many_todos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger member_todos_limit before insert on public.member_todos
  for each row execute function public.member_todos_limit();

-- The member's agent hears about new to-dos once: no second alert while an
-- earlier one for this member is unread. Routed like new messages (0022).
create function public.member_todos_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  admin uuid;
  member_name text;
  title text;
begin
  begin
    select public.lead_first_name(full_name, email), agent_id into member_name, recipient from profiles where id = new.profile_id;
    recipient := coalesce(recipient, public.lead_router());
    title := 'Suggested to-do from ' || member_name;
    if recipient is null then
      for admin in select public.role_admin_ids() loop
        if not exists (select 1 from staff_notifications where recipient_id = admin and kind = 'member_todo' and ref_id = new.profile_id::text and read_at is null) then
          perform public.staff_notify(admin, 'member_todo', title, 'profiles', new.profile_id::text);
        end if;
      end loop;
    elsif not exists (select 1 from staff_notifications where recipient_id = recipient and kind = 'member_todo' and ref_id = new.profile_id::text and read_at is null) then
      perform public.staff_notify(recipient, 'member_todo', title, 'profiles', new.profile_id::text);
    end if;
  exception when others then
    insert into notification_errors (source, detail) values ('member_todo:' || new.id, left(sqlerrm, 1000));
  end;
  return null;
end;
$$;

create trigger member_todos_after_insert after insert on public.member_todos
  for each row execute function public.member_todos_after_insert();

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind in (
  'new_lead', 'lead_digest', 'lead_reassigned', 'lead_escalated', 'new_message',
  'delivery_failed', 'delivery_overdue', 'routing_missing', 'sync_alert', 'sync_recovered', 'ai_budget',
  'member_todo'));

-- The member ticks an approved to-do done (or not done).
create function public.set_my_todo_done(p_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update member_todos
     set done = p_done, done_at = case when p_done then coalesce(done_at, now()) else null end
   where id = p_id and profile_id = auth.uid() and status = 'approved';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Staff who can see the member approve or decline a waiting to-do. Audited.
create function public.decide_member_todo(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member uuid;
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  update member_todos
     set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending' and public.can_see_member(profile_id)
  returning profile_id into member;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), case when p_approve then 'approve_member_todo' else 'decline_member_todo' end, 'member_todos', p_id::text, jsonb_build_object('member', member));
end;
$$;

-- "Delete my assistant data": the caller's waiting and declined to-dos.
create function public.delete_my_assistant_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from member_todos where profile_id = auth.uid() and status in ('pending', 'declined');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.member_todos_limit() from public, anon, authenticated;
revoke execute on function public.member_todos_after_insert() from public, anon, authenticated;
revoke execute on function public.set_my_todo_done(uuid, boolean) from public, anon;
revoke execute on function public.decide_member_todo(uuid, boolean) from public, anon;
revoke execute on function public.delete_my_assistant_data() from public, anon;
grant execute on function public.set_my_todo_done(uuid, boolean) to authenticated;
grant execute on function public.decide_member_todo(uuid, boolean) to authenticated;
grant execute on function public.delete_my_assistant_data() to authenticated;
