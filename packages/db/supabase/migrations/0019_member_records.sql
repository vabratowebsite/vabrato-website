-- S5 PR 4: buyer tracker, tour requests, documents, messages.
--
-- * tracked_properties gain listing_key (cleared when the listing leaves the
--   feed and by the MLS-9 purge; review item 5) and a staff read policy.
-- * leads gain profile_id (set for signed-in members, by the member's own
--   client), a tour status that only staff change (tours are never
--   auto-confirmed; review item 16), and my_tour_requests() so members read
--   their own requests without seeing staff columns.
-- * profiles.buyer_agreement_on_file_at: staff record a buyer agreement
--   (console field, review item 16).
-- * member_documents + private bucket member-docs, path member/{profile_id}/…
--   (review item 8: type checked by magic bytes in the app, no SVG, 20 MB).
-- * messages: one thread per member with the staff who may see them; plain
--   text, rate-limited per sender (review item 9).
-- All tables have RLS; members never read each other's rows (SEC-1/SEC-2).

-- Buyer tracker -------------------------------------------------------------------

alter table public.tracked_properties
  add column listing_key text references public.mls_listings (listing_key) on delete set null;

create unique index tracked_properties_buyer_listing_idx on public.tracked_properties (buyer_id, listing_key) where listing_key is not null;

create policy "tracked_properties: staff who may see the member read"
  on public.tracked_properties for select to authenticated
  using (public.is_staff() and public.can_see_member(buyer_id));

create policy "property_events: staff who may see the member read"
  on public.property_events for select to authenticated
  using (
    public.is_staff() and exists (
      select 1 from public.tracked_properties tp
      where tp.id = property_events.tracked_property_id and public.can_see_member(tp.buyer_id)
    )
  );

-- The MLS-9 purge clears the MLS link too (member_alert_data covers alerts).
create or replace function public.purge_member_alert_data(p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d integer;
  m integer;
begin
  delete from alert_deliveries where p_all or created_at < now() - interval '90 days';
  get diagnostics d = row_count;
  delete from notifications
   where template_key in ('buyer_alert_instant', 'buyer_alert_digest')
     and (p_all or created_at < now() - interval '90 days');
  get diagnostics m = row_count;
  if p_all then
    update tracked_properties set listing_key = null where listing_key is not null;
  end if;
  return jsonb_build_object('deliveries', d, 'emails', m);
end;
$$;

-- Tour requests ---------------------------------------------------------------------

create type public.tour_status as enum ('requested', 'confirmed', 'declined', 'completed', 'cancelled');

alter table public.leads
  add column profile_id uuid references public.profiles (id) on delete set null,
  add column tour_status public.tour_status,
  add column tour_confirmed_at timestamptz,
  add column tour_confirmed_by uuid references public.profiles (id) on delete set null;

create index leads_profile_idx on public.leads (profile_id) where profile_id is not null;

-- New tour leads start as requested; only staff move them on.
create function public.leads_tour_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'tour' then
    new.tour_status := 'requested';
  else
    new.tour_status := null;
  end if;
  new.tour_confirmed_at := null;
  new.tour_confirmed_by := null;
  return new;
end;
$$;

create trigger leads_tour_defaults before insert on public.leads
  for each row execute function public.leads_tour_defaults();

-- Members link their own requests; nobody links someone else's.
drop policy "leads: public submits" on public.leads;
create policy "leads: public submits" on public.leads for insert to anon, authenticated
  with check (status = 'new' and assigned_to is null and (profile_id is null or profile_id = auth.uid()));

grant insert (profile_id) on public.leads to authenticated;

-- Staff confirm or decline tours (S6 console; staff who may see the member).
create function public.set_tour_status(p_lead uuid, p_status public.tour_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  update leads
     set tour_status = p_status,
         tour_confirmed_at = case when p_status = 'confirmed' then now() else tour_confirmed_at end,
         tour_confirmed_by = case when p_status = 'confirmed' then auth.uid() else tour_confirmed_by end
   where id = p_lead and kind = 'tour'
     and (public.is_admin() or assigned_to = auth.uid() or (profile_id is not null and public.can_see_member(profile_id)));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- The member's own tour requests, without staff-only columns.
create function public.my_tour_requests()
returns table (
  id uuid,
  listing_key text,
  message text,
  payload jsonb,
  tour_status public.tour_status,
  tour_confirmed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.listing_key, l.message, l.payload, l.tour_status, l.tour_confirmed_at, l.created_at
  from leads l
  where l.profile_id = auth.uid() and l.kind = 'tour'
  order by l.created_at desc
  limit 100;
$$;

-- Buyer agreement on file (review item 16) ----------------------------------------

alter table public.profiles add column buyer_agreement_on_file_at timestamptz;

create function public.set_buyer_agreement(p_member uuid, p_on_file boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() and public.can_see_member(p_member)) then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  update profiles set buyer_agreement_on_file_at = case when p_on_file then now() else null end
   where id = p_member and role in ('buyer', 'seller', 'both');
end;
$$;

-- Documents -----------------------------------------------------------------------

create table public.member_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  storage_path text not null unique check (storage_path ~ '^member/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic')),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path like 'member/' || profile_id::text || '/%')
);

create index member_documents_profile_idx on public.member_documents (profile_id, created_at desc);

alter table public.member_documents enable row level security;

create policy "member_documents: own, or staff who may see the member"
  on public.member_documents for select to authenticated
  using (profile_id = auth.uid() or public.can_see_member(profile_id));

create policy "member_documents: member or their staff add"
  on public.member_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (profile_id = auth.uid() or (public.is_staff() and public.can_see_member(profile_id)))
  );

create policy "member_documents: uploader removes"
  on public.member_documents for delete to authenticated
  using (uploaded_by = auth.uid());

revoke all on public.member_documents from anon, authenticated;
grant select, delete on public.member_documents to authenticated;
grant insert (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) on public.member_documents to authenticated;

insert into storage.buckets (id, name, public) values ('member-docs', 'member-docs', false)
on conflict (id) do nothing;

-- Hosted storage enforces size and type limits too (columns don't exist in
-- the PGlite test stub).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets
      set file_size_limit = 20971520,
          allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
      where id = 'member-docs'$q$;
  end if;
end;
$$;

create function public.storage_member_id(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] = 'member'
      and (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid
    else null
  end;
$$;

create policy "member-docs bucket: own folder, or staff who may see the member"
  on storage.objects for select to authenticated
  using (bucket_id = 'member-docs' and public.can_see_member(public.storage_member_id(name)));

create policy "member-docs bucket: member or their staff upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-docs'
    and (public.storage_member_id(name) = auth.uid()
         or (public.is_staff() and public.can_see_member(public.storage_member_id(name))))
  );

create policy "member-docs bucket: member deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'member-docs' and public.storage_member_id(name) = auth.uid());

-- Messages ------------------------------------------------------------------------

create table public.messages (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_member_idx on public.messages (member_id, created_at);
create index messages_sender_recent_idx on public.messages (sender_id, created_at);

alter table public.messages enable row level security;

create policy "messages: the member and staff who may see them read"
  on public.messages for select to authenticated
  using (member_id = auth.uid() or (public.is_staff() and public.can_see_member(member_id)));

create policy "messages: send as yourself, to your own thread or one you may see"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (member_id = auth.uid() or (public.is_staff() and public.can_see_member(member_id)))
  );

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (member_id, sender_id, body) on public.messages to authenticated;

-- Per-sender limits: 20 messages in 10 minutes, 200 a day (review item 9).
create function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '10 minutes') >= 20
     or (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'messages_rate_limited' using errcode = 'P0001';
  end if;
  new.read_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_rate_limit before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- Marks the other side's messages in a thread as read.
create function public.mark_messages_read(p_member uuid)
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
  if not (p_member = auth.uid() or (public.is_staff() and public.can_see_member(p_member))) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update messages set read_at = now()
   where member_id = p_member and read_at is null and sender_id is distinct from auth.uid()
     -- Members mark staff replies read; staff mark the member's messages read.
     and (p_member = auth.uid() or sender_id = p_member);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Function privileges ---------------------------------------------------------------

revoke execute on function public.leads_tour_defaults() from public, anon, authenticated;
revoke execute on function public.messages_rate_limit() from public, anon, authenticated;
revoke execute on function public.storage_member_id(text) from public, anon;
revoke execute on function public.set_tour_status(uuid, public.tour_status) from public, anon;
revoke execute on function public.my_tour_requests() from public, anon;
revoke execute on function public.set_buyer_agreement(uuid, boolean) from public, anon;
revoke execute on function public.mark_messages_read(uuid) from public, anon;

grant execute on function public.storage_member_id(text) to authenticated;
grant execute on function public.set_tour_status(uuid, public.tour_status) to authenticated;
grant execute on function public.my_tour_requests() to authenticated;
grant execute on function public.set_buyer_agreement(uuid, boolean) to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
