-- S5b PR 6: design (owner answers 2026-11-14).
--
-- - ai_member_palette (off): colors and a moodboard for buyers and sellers.
-- - ai_member_staging (off): staging ideas for a room a seller describes.
-- - ai_member_flyer (off): an open-house flyer and social posts for a seller,
--   written only from the seller's own words. The model never sees MLS data,
--   so none of these needs the MLSListings approval (0039).
-- - member_promos: a flyer and its posts that the seller sends to their agent.
--   It waits ("pending") until the agent approves it and attaches one of our
--   own listings (and, if they like, one of its open houses), or declines it
--   with a note. The flyer's facts, photo and agent card come from our
--   records when it is shown, never from the assistant. A sent flyer can't be
--   changed; the seller sends a new one instead.
-- - The member's agent gets one bell alert (no email) when flyers are sent.
-- - Declined flyers are deleted after 30 days; "Delete my assistant data"
--   removes all of the member's flyers.
--
-- Who sees what: the member, and staff who can see the member
-- (can_see_member, 0016). Decisions go through decide_member_promo.

insert into public.feature_flags (key, description) values
  ('ai_member_palette', 'Ask Vabrato: a color palette and moodboard from a member''s notes about a room or style. Our code draws the swatches; nothing is kept.'),
  ('ai_member_staging', 'Ask Vabrato: staging ideas for a room a seller describes in words. Ideas the seller adds to their to-dos wait for their agent''s approval.'),
  ('ai_member_flyer', 'Ask Vabrato: an open-house flyer and social posts written from the seller''s own words. The agent approves each one and attaches our listing; the facts come from our records.')
on conflict (key) do nothing;

create table public.member_promos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('open_house', 'just_listed')),
  headline text not null check (char_length(headline) between 1 and 80),
  highlights text not null default '' check (char_length(highlights) <= 600),
  blurb text not null default '' check (char_length(blurb) <= 600),
  instagram text not null default '' check (char_length(instagram) <= 600),
  facebook text not null default '' check (char_length(facebook) <= 800),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  listing_key text check (listing_key ~ '^[A-Za-z0-9._-]{1,64}$'),
  open_house_key text check (char_length(open_house_key) between 1 and 128),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decline_note text check (char_length(decline_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check (status <> 'approved' or listing_key is not null),
  check (open_house_key is null or listing_key is not null),
  check (status = 'declined' or decline_note is null)
);

create index member_promos_profile_idx on public.member_promos (profile_id, created_at desc);
create index member_promos_pending_idx on public.member_promos (profile_id) where status = 'pending';

alter table public.member_promos enable row level security;

create policy "member_promos: the member or their staff read"
  on public.member_promos for select to authenticated
  using (profile_id = auth.uid() or (public.is_staff() and public.can_see_member(profile_id)));

-- Only a seller sends one, for themselves, as a new pending flyer (column grant below).
create policy "member_promos: a seller sends"
  on public.member_promos for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('seller', 'both'))
  );

-- The member deletes their own while it waits or after it was declined.
create policy "member_promos: the member deletes waiting or declined"
  on public.member_promos for delete to authenticated
  using (profile_id = auth.uid() and status in ('pending', 'declined'));

revoke all on public.member_promos from anon, authenticated;
grant select, delete on public.member_promos to authenticated;
grant insert (profile_id, kind, headline, highlights, blurb, instagram, facebook) on public.member_promos to authenticated;

-- At most 20 per member; the words never change after sending, and only the
-- decision fields change, once, through decide_member_promo.
create function public.member_promos_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('member_promos:' || new.profile_id::text, 0));
    if (select count(*) from member_promos where profile_id = new.profile_id) >= 20 then
      raise exception 'too_many_flyers' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.profile_id is distinct from old.profile_id or new.kind is distinct from old.kind
     or new.headline is distinct from old.headline or new.highlights is distinct from old.highlights
     or new.blurb is distinct from old.blurb or new.instagram is distinct from old.instagram
     or new.facebook is distinct from old.facebook or new.created_at is distinct from old.created_at then
    raise exception 'flyer_fixed_fields' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'flyer_decided' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger member_promos_guard before insert or update on public.member_promos
  for each row execute function public.member_promos_guard();

-- The member's agent hears about new flyers once: no second alert while an
-- earlier one for this member is unread. Routed like suggested to-dos (0037).
create function public.member_promos_after_insert()
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
    title := 'Flyer to approve from ' || member_name;
    if recipient is null then
      for admin in select public.role_admin_ids() loop
        if not exists (select 1 from staff_notifications where recipient_id = admin and kind = 'member_promo' and ref_id = new.profile_id::text and read_at is null) then
          perform public.staff_notify(admin, 'member_promo', title, 'profiles', new.profile_id::text);
        end if;
      end loop;
    elsif not exists (select 1 from staff_notifications where recipient_id = recipient and kind = 'member_promo' and ref_id = new.profile_id::text and read_at is null) then
      perform public.staff_notify(recipient, 'member_promo', title, 'profiles', new.profile_id::text);
    end if;
  exception when others then
    insert into notification_errors (source, detail) values ('member_promo:' || new.id, left(sqlerrm, 1000));
  end;
  return null;
end;
$$;

create trigger member_promos_after_insert after insert on public.member_promos
  for each row execute function public.member_promos_after_insert();

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind in (
  'new_lead', 'lead_digest', 'lead_reassigned', 'lead_escalated', 'new_message',
  'delivery_failed', 'delivery_overdue', 'routing_missing', 'sync_alert', 'sync_recovered', 'ai_budget',
  'member_todo', 'member_promo'));

-- Staff who can see the member approve a waiting flyer, attaching one of our
-- own listings (and optionally one of its open houses that hasn't ended), or
-- decline it with an optional note. Audited.
create function public.decide_member_promo(p_id uuid, p_approve boolean, p_listing_key text default null, p_open_house_key text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_approve then
    if p_listing_key is null or not exists (select 1 from mls_listings where listing_key = p_listing_key and is_own_listing) then
      raise exception 'not_our_listing' using errcode = 'P0001';
    end if;
    if p_open_house_key is not null and not exists (
      select 1 from mls_open_houses
       where open_house_key = p_open_house_key and listing_key = p_listing_key
         and coalesce(end_time, start_time, (open_house_date + 1)::timestamptz) > now()
    ) then
      raise exception 'not_this_open_house' using errcode = 'P0001';
    end if;
    update member_promos
       set status = 'approved', listing_key = p_listing_key, open_house_key = p_open_house_key,
           decided_by = auth.uid(), decided_at = now()
     where id = p_id and status = 'pending' and public.can_see_member(profile_id)
    returning profile_id into member;
  else
    if char_length(note) > 300 then
      raise exception 'note_too_long' using errcode = 'P0001';
    end if;
    update member_promos
       set status = 'declined', decline_note = note, decided_by = auth.uid(), decided_at = now()
     where id = p_id and status = 'pending' and public.can_see_member(profile_id)
    returning profile_id into member;
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), case when p_approve then 'approve_member_promo' else 'decline_member_promo' end, 'member_promos', p_id::text,
          jsonb_build_object('member', member, 'listing', case when p_approve then p_listing_key end));
end;
$$;

-- The daily purge (0038's job) also deletes flyers declined over 30 days ago.
create or replace function public.purge_member_drafts()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from member_drafts where updated_at < now() - interval '30 days' returning 1
  ), promos as (
    delete from member_promos where status = 'declined' and decided_at < now() - interval '30 days' returning 1
  )
  select ((select count(*) from gone) + (select count(*) from promos))::integer;
$$;

-- "Delete my assistant data" now also removes the member's flyers.
create or replace function public.delete_my_assistant_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  d integer;
  p integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from member_todos where profile_id = auth.uid() and status in ('pending', 'declined');
  get diagnostics n = row_count;
  delete from member_drafts where profile_id = auth.uid();
  get diagnostics d = row_count;
  delete from member_promos where profile_id = auth.uid();
  get diagnostics p = row_count;
  return n + d + p;
end;
$$;

revoke execute on function public.member_promos_guard() from public, anon, authenticated;
revoke execute on function public.member_promos_after_insert() from public, anon, authenticated;
revoke execute on function public.purge_member_drafts() from public, anon, authenticated;
revoke execute on function public.decide_member_promo(uuid, boolean, text, text, text) from public, anon;
revoke execute on function public.delete_my_assistant_data() from public, anon;
grant execute on function public.decide_member_promo(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.delete_my_assistant_data() to authenticated;
