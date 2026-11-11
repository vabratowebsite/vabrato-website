-- S6 PR 4: content editor with approval, agent photos, featured listings.
--
-- * Website content (city guides, Insights posts, testimonials) changes only
--   through content_revisions: anyone on staff writes a draft and submits
--   it; only the acting lead admin (Mark, or Viv while Mark is away)
--   publishes or rejects it (SPEC <approvals>). The live row changes only on
--   publish, so editing a page never takes it down. Direct writes to those
--   tables are removed, role admins included.
-- * publish_content() writes only to a fixed set of tables (no table name
--   from the caller ever reaches dynamic SQL).
-- * Testimonials need a source and the client's permission before they can
--   be published.
-- * Agent profiles: agents still edit their own row directly (no approval,
--   SPEC <approvals>); photos go to the public agent-photos bucket, in the
--   agent's own folder, images only.
-- * featured_listings: staff pin listings to the home page (no approval).
--   The public sees a pin only while it's in its date window and the listing
--   is visible at IDX level.

-- Approval columns on the published tables ---------------------------------------------------

alter table public.city_guides add column approved_by uuid references public.profiles (id) on delete set null, add column approved_at timestamptz;
alter table public.posts add column approved_by uuid references public.profiles (id) on delete set null, add column approved_at timestamptz;
alter table public.testimonials
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column approved_at timestamptz,
  add column permission_confirmed boolean not null default false;

-- No more direct writes: publishing goes through publish_content().
drop policy "city_guides: admin writes" on public.city_guides;
drop policy "posts: admin writes" on public.posts;
drop policy "testimonials: admin writes" on public.testimonials;
revoke insert, update, delete on public.city_guides, public.posts, public.testimonials from authenticated;

-- Revisions ----------------------------------------------------------------------------------

create type public.content_table as enum ('city_guides', 'posts', 'testimonials');
create type public.revision_status as enum ('draft', 'submitted', 'rejected', 'published');

create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  table_name public.content_table not null,
  -- city_guides: city slug; posts: post slug; testimonials: id, or null for a new one.
  row_key text check (row_key is null or char_length(row_key) <= 120),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536),
  status public.revision_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_revisions_status_idx on public.content_revisions (status, updated_at desc);

alter table public.content_revisions enable row level security;
create policy "content_revisions: staff read"
  on public.content_revisions for select to authenticated
  using (public.is_staff());
revoke all on public.content_revisions from anon, authenticated;
grant select on public.content_revisions to authenticated;

-- Body shape per table, checked when saving and again on publish.
create function public.content_body_ok(p_table public.content_table, p_key text, p_body jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_table = 'city_guides' then
    if p_key is null or p_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return 'city_slug'; end if;
    if jsonb_typeof(p_body -> 'intro') <> 'string' or char_length(p_body ->> 'intro') > 6000 then return 'intro'; end if;
    if jsonb_typeof(coalesce(p_body -> 'neighborhoods', '[]')) <> 'array' then return 'neighborhoods'; end if;
    if jsonb_typeof(coalesce(p_body -> 'school_links', '[]')) <> 'array' then return 'school_links'; end if;
    if jsonb_typeof(coalesce(p_body -> 'faq', '[]')) <> 'array' then return 'faq'; end if;
  elsif p_table = 'posts' then
    if p_key is null or p_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_key) > 100 then return 'slug'; end if;
    if coalesce(p_body ->> 'kind', '') not in ('insight', 'news', 'event', 'market_update') then return 'kind'; end if;
    if char_length(coalesce(p_body ->> 'title', '')) not between 1 and 200 then return 'title'; end if;
    if char_length(coalesce(p_body ->> 'excerpt', '')) > 400 then return 'excerpt'; end if;
    if char_length(coalesce(p_body ->> 'body_md', '')) not between 1 and 50000 then return 'body_md'; end if;
  elsif p_table = 'testimonials' then
    if char_length(coalesce(p_body ->> 'author_display', '')) not between 1 and 60 then return 'author_display'; end if;
    if char_length(coalesce(p_body ->> 'quote', '')) not between 1 and 1200 then return 'quote'; end if;
    if coalesce(p_body ->> 'role', 'buyer') not in ('buyer', 'seller', 'both') then return 'role'; end if;
  end if;
  return null;
end;
$$;

-- Save (or update) a draft. A draft, or a rejected revision, can be edited
-- by its author or the acting lead admin; submitted and published ones can't.
create function public.save_content_draft(p_revision uuid, p_table public.content_table, p_key text, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r content_revisions;
  bad text;
  id uuid;
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_table = 'testimonials' and p_key is not null and p_key !~ '^[0-9a-f-]{36}$' then
    raise exception 'bad_key' using errcode = '22023';
  end if;
  bad := public.content_body_ok(p_table, p_key, coalesce(p_body, '{}'::jsonb));
  if bad is not null then
    raise exception 'invalid_%', bad using errcode = '22023';
  end if;
  if p_table = 'city_guides' and not exists (select 1 from cities where slug = p_key) then
    raise exception 'invalid_city_slug' using errcode = '22023';
  end if;
  if p_revision is null then
    insert into content_revisions (table_name, row_key, body, created_by)
    values (p_table, p_key, p_body, auth.uid()) returning content_revisions.id into id;
    return id;
  end if;
  select * into r from content_revisions where content_revisions.id = p_revision for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.table_name <> p_table then
    raise exception 'wrong_table' using errcode = '22023';
  end if;
  if r.status not in ('draft', 'rejected') then
    raise exception 'not_editable' using errcode = '42501';
  end if;
  if r.created_by is distinct from auth.uid() and not public.is_acting_lead_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update content_revisions
     set row_key = p_key, body = p_body, status = 'draft', updated_at = now(), review_note = null
   where content_revisions.id = p_revision;
  return p_revision;
end;
$$;

create function public.submit_content(p_revision uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r content_revisions;
begin
  select * into r from content_revisions where id = p_revision for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.created_by is distinct from auth.uid() and not public.is_acting_lead_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status not in ('draft', 'rejected') then
    raise exception 'not_editable' using errcode = '42501';
  end if;
  update content_revisions set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_revision;
end;
$$;

create function public.reject_content(p_revision uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_acting_lead_admin() then
    raise exception 'lead_admin_only' using errcode = '42501';
  end if;
  update content_revisions
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
         review_note = left(nullif(btrim(p_note), ''), 1000)
   where id = p_revision and status = 'submitted';
  if not found then
    raise exception 'not_submitted' using errcode = '42501';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id) values (auth.uid(), 'reject_content', 'content_revisions', p_revision::text);
end;
$$;

-- Publish a submitted revision to its live table. Fixed table list.
create function public.publish_content(p_revision uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r content_revisions;
  b jsonb;
  bad text;
  key text;
begin
  if not public.is_acting_lead_admin() then
    raise exception 'lead_admin_only' using errcode = '42501';
  end if;
  select * into r from content_revisions where id = p_revision for update;
  if not found or r.status <> 'submitted' then
    raise exception 'not_submitted' using errcode = '42501';
  end if;
  b := r.body;
  bad := public.content_body_ok(r.table_name, r.row_key, b);
  if bad is not null then
    raise exception 'invalid_%', bad using errcode = '22023';
  end if;
  key := r.row_key;

  if r.table_name = 'city_guides' then
    insert into city_guides (city_slug, intro, neighborhoods, school_links, faq, published, is_placeholder, approved_by, approved_at, updated_at)
    values (key, b ->> 'intro', coalesce(b -> 'neighborhoods', '[]'), coalesce(b -> 'school_links', '[]'), coalesce(b -> 'faq', '[]'), true, false, auth.uid(), now(), now())
    on conflict (city_slug) do update set
      intro = excluded.intro, neighborhoods = excluded.neighborhoods, school_links = excluded.school_links, faq = excluded.faq,
      published = true, is_placeholder = false, approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = now();
  elsif r.table_name = 'posts' then
    insert into posts (slug, kind, title, excerpt, body_md, published, published_at, is_placeholder, approved_by, approved_at, updated_at)
    values (key, (b ->> 'kind')::post_kind, b ->> 'title', coalesce(b ->> 'excerpt', ''), b ->> 'body_md', true, now(), false, auth.uid(), now(), now())
    on conflict (slug) do update set
      kind = excluded.kind, title = excluded.title, excerpt = excluded.excerpt, body_md = excluded.body_md,
      published = true, published_at = coalesce(posts.published_at, now()), is_placeholder = false,
      approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = now();
  elsif r.table_name = 'testimonials' then
    if coalesce(btrim(b ->> 'source'), '') = '' or coalesce((b ->> 'permission_confirmed')::boolean, false) is not true then
      raise exception 'testimonial_needs_source_and_permission' using errcode = '22023';
    end if;
    if key is null then
      insert into testimonials (author_display, role, quote, source, sort, permission_confirmed, published, is_placeholder, approved_by, approved_at)
      values (b ->> 'author_display', coalesce(b ->> 'role', 'buyer'), b ->> 'quote', b ->> 'source', coalesce((b ->> 'sort')::integer, 0), true, true, false, auth.uid(), now())
      returning id::text into key;
    else
      update testimonials set author_display = b ->> 'author_display', role = coalesce(b ->> 'role', 'buyer'), quote = b ->> 'quote',
             source = b ->> 'source', sort = coalesce((b ->> 'sort')::integer, sort), permission_confirmed = true,
             published = true, is_placeholder = false, approved_by = auth.uid(), approved_at = now()
       where id = key::uuid;
      if not found then
        raise exception 'not_found' using errcode = 'P0002';
      end if;
    end if;
  end if;

  update content_revisions
     set status = 'published', row_key = key, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_revision;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'publish_content', r.table_name::text, key, jsonb_build_object('revision', p_revision));
  return key;
end;
$$;

-- Take a page down (acting lead admin). Fixed table list.
create function public.unpublish_content(p_table public.content_table, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_acting_lead_admin() then
    raise exception 'lead_admin_only' using errcode = '42501';
  end if;
  if p_table = 'city_guides' then
    update city_guides set published = false, updated_at = now() where city_slug = p_key;
  elsif p_table = 'posts' then
    update posts set published = false, updated_at = now() where slug = p_key;
  elsif p_table = 'testimonials' then
    update testimonials set published = false where id::text = p_key;
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id) values (auth.uid(), 'unpublish_content', p_table::text, p_key);
end;
$$;

-- Agent photos ---------------------------------------------------------------------------------

alter table public.agent_profiles
  add constraint agent_profiles_photo_path_check check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$');

-- Agents set a photo only from their own folder (admins may set any).
create or replace function public.agent_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and (select auth.uid()) is not null and (
    new.slug is distinct from old.slug
    or new.profile_id is distinct from old.profile_id
    or new.published is distinct from old.published
    or new.sort is distinct from old.sort
  ) then
    raise exception 'Only an admin can change slug, owner, publish state or order' using errcode = '42501';
  end if;
  if not public.is_admin() and (select auth.uid()) is not null
     and new.photo_path is distinct from old.photo_path and new.photo_path is not null
     and split_part(new.photo_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'photo_not_yours' using errcode = '42501';
  end if;
  return new;
end;
$$;

insert into storage.buckets (id, name, public) values ('agent-photos', 'agent-photos', true)
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets
      set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'agent-photos'$q$;
  end if;
end;
$$;

-- Reads through the API (listing, upsert) are for staff; the public gets the
-- files through the bucket's public URL.
create policy "agent-photos bucket: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'agent-photos' and public.is_staff());
create policy "agent-photos bucket: staff upload to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'agent-photos' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "agent-photos bucket: staff replace their own"
  on storage.objects for update to authenticated
  using (bucket_id = 'agent-photos' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'agent-photos' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "agent-photos bucket: staff delete their own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'agent-photos' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);

-- Featured listings ------------------------------------------------------------------------------

create table public.featured_listings (
  listing_key text primary key check (listing_key ~ '^[A-Za-z0-9._-]{1,64}$'),
  sort integer not null default 0 check (sort between 0 and 1000),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.featured_listings enable row level security;
-- Public: in its window and the listing is visible at IDX level (the
-- subquery runs under the reader's own mls_listings policy).
create policy "featured_listings: public reads live pins"
  on public.featured_listings for select to anon, authenticated
  using (
    (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
    and exists (select 1 from public.mls_listings l where l.listing_key = featured_listings.listing_key)
  );
create policy "featured_listings: staff read all"
  on public.featured_listings for select to authenticated
  using (public.is_staff());
create policy "featured_listings: staff add"
  on public.featured_listings for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "featured_listings: staff change"
  on public.featured_listings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "featured_listings: staff remove"
  on public.featured_listings for delete to authenticated
  using (public.is_staff());
revoke all on public.featured_listings from anon, authenticated;
grant select on public.featured_listings to anon, authenticated;
grant insert (listing_key, sort, starts_at, ends_at, created_by), update (sort, starts_at, ends_at), delete on public.featured_listings to authenticated;

-- Card data for the home page's pinned listings (security invoker: IDX rows only).
grant execute on function public.listing_cards(text[]) to anon;

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.content_body_ok(public.content_table, text, jsonb) from public, anon;
revoke execute on function public.save_content_draft(uuid, public.content_table, text, jsonb) from public, anon;
revoke execute on function public.submit_content(uuid) from public, anon;
revoke execute on function public.reject_content(uuid, text) from public, anon;
revoke execute on function public.publish_content(uuid) from public, anon;
revoke execute on function public.unpublish_content(public.content_table, text) from public, anon;

grant execute on function public.content_body_ok(public.content_table, text, jsonb) to authenticated;
grant execute on function public.save_content_draft(uuid, public.content_table, text, jsonb) to authenticated;
grant execute on function public.submit_content(uuid) to authenticated;
grant execute on function public.reject_content(uuid, text) to authenticated;
grant execute on function public.publish_content(uuid) to authenticated;
grant execute on function public.unpublish_content(public.content_table, text) to authenticated;
