-- S4 foundations: public-site content, leads, and the public MLS read API.
--
-- Content tables (cities, city_guides, agent_profiles, testimonials, videos,
-- posts) are public when published and edited by admins (the S6 console adds
-- the editor and Mark's approval flow; agents edit their own profile).
-- `is_placeholder` marks seeded placeholder copy; content_launch_blockers()
-- lists any published placeholder and is part of the S9 launch check.
--
-- leads: public forms insert only (no read-back). Per-email and per-IP
-- limits are enforced here; routing to Mark is S6.
--
-- MLS: mock marker on the S3 tables (so preview data can be purged), the
-- public last-updated time (MLS-1), search_listings() (IDX, under RLS),
-- and public_own_sold() for when `public_sold` is turned on (MLS-10).

-- Flags -------------------------------------------------------------------------

insert into public.feature_flags (key, description) values
  ('site_scl_enabled', 'G2: serve the homes.sancarloslife.com listings section. Off: the host returns 404 and shows no MLS data.')
on conflict (key) do nothing;

-- Mock marker (preview data only; MLS-8 still holds: mock rows are fictional) --

alter table public.mls_listings drop constraint mls_listings_source_check;
alter table public.mls_listings add constraint mls_listings_source_check check (source in ('MLSListings', 'mock'));
alter table public.mls_members add column source text not null default 'MLSListings' check (source in ('MLSListings', 'mock'));
alter table public.mls_offices add column source text not null default 'MLSListings' check (source in ('MLSListings', 'mock'));

create index mls_listings_lat_lng_idx on public.mls_listings (latitude, longitude);

-- Cities (SPEC <service_area>) -----------------------------------------------------

create type public.city_kind as enum ('city', 'unincorporated');

create table public.cities (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  county text not null check (county in ('San Mateo', 'Santa Clara')),
  kind public.city_kind not null default 'city',
  -- Spellings of this place in the feed's City field.
  mls_city_names text[] not null,
  -- Higher first; priority cities get hand-written guides.
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.cities (slug, name, county, mls_city_names, priority) values
  ('atherton', 'Atherton', 'San Mateo', '{Atherton}', 0),
  ('belmont', 'Belmont', 'San Mateo', '{Belmont}', 0),
  ('brisbane', 'Brisbane', 'San Mateo', '{Brisbane}', 0),
  ('burlingame', 'Burlingame', 'San Mateo', '{Burlingame}', 0),
  ('colma', 'Colma', 'San Mateo', '{Colma}', 0),
  ('daly-city', 'Daly City', 'San Mateo', '{"Daly City"}', 0),
  ('east-palo-alto', 'East Palo Alto', 'San Mateo', '{"East Palo Alto"}', 0),
  ('foster-city', 'Foster City', 'San Mateo', '{"Foster City"}', 0),
  ('half-moon-bay', 'Half Moon Bay', 'San Mateo', '{"Half Moon Bay"}', 0),
  ('hillsborough', 'Hillsborough', 'San Mateo', '{Hillsborough}', 0),
  ('menlo-park', 'Menlo Park', 'San Mateo', '{"Menlo Park"}', 0),
  ('millbrae', 'Millbrae', 'San Mateo', '{Millbrae}', 0),
  ('pacifica', 'Pacifica', 'San Mateo', '{Pacifica}', 0),
  ('portola-valley', 'Portola Valley', 'San Mateo', '{"Portola Valley"}', 0),
  ('redwood-city', 'Redwood City', 'San Mateo', '{"Redwood City"}', 0),
  ('san-bruno', 'San Bruno', 'San Mateo', '{"San Bruno"}', 0),
  ('san-carlos', 'San Carlos', 'San Mateo', '{"San Carlos"}', 100),
  ('san-mateo', 'San Mateo', 'San Mateo', '{"San Mateo"}', 0),
  ('south-san-francisco', 'South San Francisco', 'San Mateo', '{"South San Francisco"}', 0),
  ('woodside', 'Woodside', 'San Mateo', '{Woodside}', 0),
  ('campbell', 'Campbell', 'Santa Clara', '{Campbell}', 0),
  ('cupertino', 'Cupertino', 'Santa Clara', '{Cupertino}', 0),
  ('gilroy', 'Gilroy', 'Santa Clara', '{Gilroy}', 0),
  ('los-altos', 'Los Altos', 'Santa Clara', '{"Los Altos"}', 0),
  ('los-altos-hills', 'Los Altos Hills', 'Santa Clara', '{"Los Altos Hills"}', 0),
  ('los-gatos', 'Los Gatos', 'Santa Clara', '{"Los Gatos"}', 0),
  ('milpitas', 'Milpitas', 'Santa Clara', '{Milpitas}', 0),
  ('monte-sereno', 'Monte Sereno', 'Santa Clara', '{"Monte Sereno"}', 0),
  ('morgan-hill', 'Morgan Hill', 'Santa Clara', '{"Morgan Hill"}', 0),
  ('mountain-view', 'Mountain View', 'Santa Clara', '{"Mountain View"}', 0),
  ('palo-alto', 'Palo Alto', 'Santa Clara', '{"Palo Alto"}', 0),
  ('san-jose', 'San Jose', 'Santa Clara', '{"San Jose"}', 0),
  ('santa-clara', 'Santa Clara', 'Santa Clara', '{"Santa Clara"}', 0),
  ('saratoga', 'Saratoga', 'Santa Clara', '{Saratoga}', 0),
  ('sunnyvale', 'Sunnyvale', 'Santa Clara', '{Sunnyvale}', 0);

create table public.city_guides (
  city_slug text primary key references public.cities (slug) on delete cascade,
  intro text not null default '',
  neighborhoods jsonb not null default '[]',
  -- Official district links only, no ratings (review item 14).
  school_links jsonb not null default '[]',
  faq jsonb not null default '[]',
  published boolean not null default false,
  is_placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.city_guides (city_slug, intro, neighborhoods, faq) values (
  'san-carlos',
  'PLACEHOLDER: hand-written San Carlos guide copy goes here (S4 content checklist).',
  '[{"name": "PLACEHOLDER neighborhood", "summary": "Placeholder summary."}]',
  '[{"q": "PLACEHOLDER question?", "a": "Placeholder answer."}]'
);

-- Agent profiles (SPEC <agent_roster>; mockups 09/10) ---------------------------------

create table public.agent_profiles (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- The signed-in agent who may edit this profile (S6).
  profile_id uuid unique references public.profiles (id) on delete set null,
  display_name text not null,
  title text not null default '',
  bio text not null default '',
  photo_path text,
  phone text,
  email text,
  license_number text,
  -- Matches ListAgentMlsId for "listings by this agent".
  mls_member_id text,
  start_year integer check (start_year is null or start_year between 1950 and 2100),
  social_links jsonb not null default '[]',
  outlook text not null default '',
  skills jsonb not null default '[]',
  history text not null default '',
  video_youtube_id text check (video_youtube_id is null or video_youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  faq jsonb not null default '[]',
  sort integer not null default 0,
  published boolean not null default false,
  is_placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.agent_profiles (slug, display_name, title, bio, license_number, sort) values
  ('mark-martinho', 'Mark Martinho', 'Designated Broker', 'PLACEHOLDER: agent bio (S4 content checklist).', '01372898', 1),
  ('viv-kelvin', 'Viv Kelvin', 'Broker', 'PLACEHOLDER: agent bio (S4 content checklist).', null, 2);

-- Testimonials, videos, posts ---------------------------------------------------------

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  -- e.g. "Paul S." (first name + initial, with the client's permission).
  author_display text not null,
  role text check (role in ('buyer', 'seller', 'both')),
  quote text not null,
  source text,
  sort integer not null default 0,
  published boolean not null default false,
  is_placeholder boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.testimonials (author_display, role, quote, sort) values
  ('PLACEHOLDER A.', 'seller', 'PLACEHOLDER testimonial quote.', 1),
  ('PLACEHOLDER B.', 'buyer', 'PLACEHOLDER testimonial quote.', 2);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  sort integer not null default 0,
  published boolean not null default false,
  is_placeholder boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.post_kind as enum ('insight', 'news', 'event', 'market_update');

create table public.posts (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind public.post_kind not null default 'insight',
  title text not null,
  excerpt text not null default '',
  body_md text not null default '',
  published boolean not null default false,
  published_at timestamptz,
  is_placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.posts (slug, kind, title, excerpt, body_md, published_at) values
  ('placeholder-insight', 'insight', 'PLACEHOLDER insight title', 'Placeholder excerpt.', 'PLACEHOLDER article body.', now()),
  ('placeholder-news', 'news', 'PLACEHOLDER news title', 'Placeholder excerpt.', 'PLACEHOLDER article body.', now());

create trigger city_guides_updated_at before update on public.city_guides for each row execute function public.set_updated_at();
create trigger agent_profiles_updated_at before update on public.agent_profiles for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();

-- Content RLS --------------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.city_guides enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.testimonials enable row level security;
alter table public.videos enable row level security;
alter table public.posts enable row level security;

create policy "cities: anyone reads" on public.cities for select to anon, authenticated using (true);
create policy "cities: admin writes" on public.cities for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "city_guides: public reads published" on public.city_guides for select to anon, authenticated using (published);
create policy "city_guides: staff read all" on public.city_guides for select to authenticated using (public.is_staff());
create policy "city_guides: admin writes" on public.city_guides for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "agent_profiles: public reads published" on public.agent_profiles for select to anon, authenticated using (published);
create policy "agent_profiles: staff read all" on public.agent_profiles for select to authenticated using (public.is_staff());
create policy "agent_profiles: admin writes" on public.agent_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "agent_profiles: agent edits own" on public.agent_profiles for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy "testimonials: public reads published" on public.testimonials for select to anon, authenticated using (published);
create policy "testimonials: staff read all" on public.testimonials for select to authenticated using (public.is_staff());
create policy "testimonials: admin writes" on public.testimonials for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "videos: public reads published" on public.videos for select to anon, authenticated using (published);
create policy "videos: staff read all" on public.videos for select to authenticated using (public.is_staff());
create policy "videos: admin writes" on public.videos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "posts: public reads published" on public.posts for select to anon, authenticated
  using (published and published_at <= now());
create policy "posts: staff read all" on public.posts for select to authenticated using (public.is_staff());
create policy "posts: admin writes" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete, truncate on
  public.cities, public.city_guides, public.agent_profiles, public.testimonials, public.videos, public.posts
  from anon;

-- Agents may edit their own profile content, but only admins change its slug,
-- owner, publish state or order.
create function public.agent_profiles_guard()
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
  return new;
end;
$$;

revoke execute on function public.agent_profiles_guard() from public, anon, authenticated;

create trigger agent_profiles_guard before update on public.agent_profiles
  for each row execute function public.agent_profiles_guard();

-- Launch check (S9): published rows still marked as placeholder. Staff only.
create function public.content_launch_blockers()
returns table (table_name text, row_key text)
language sql
stable
security definer
set search_path = public
as $$
  select 'city_guides', city_slug from city_guides where published and is_placeholder and is_staff()
  union all select 'agent_profiles', slug from agent_profiles where published and is_placeholder and is_staff()
  union all select 'testimonials', id::text from testimonials where published and is_placeholder and is_staff()
  union all select 'videos', id::text from videos where published and is_placeholder and is_staff()
  union all select 'posts', slug from posts where published and is_placeholder and is_staff();
$$;

revoke execute on function public.content_launch_blockers() from public, anon;
grant execute on function public.content_launch_blockers() to authenticated;

-- Leads ----------------------------------------------------------------------------------

create type public.lead_kind as enum ('contact', 'valuation', 'tour', 'transform', 'newsletter');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  kind public.lead_kind not null,
  name text check (name is null or char_length(name) <= 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 40),
  message text check (message is null or char_length(message) <= 4000),
  listing_key text check (listing_key is null or char_length(listing_key) <= 64),
  city_slug text check (city_slug is null or char_length(city_slug) <= 64),
  payload jsonb not null default '{}' check (pg_column_size(payload) <= 8192),
  -- The person agreed to be called or texted (shown on the form).
  consent_contact boolean not null default false,
  site text not null default 'vabrato' check (site in ('vabrato', 'sancarloslife')),
  -- sha256 hex of the client IP + a server-side salt; never the IP itself.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'assigned', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index leads_email_recent_idx on public.leads (lower(email), created_at);
create index leads_ip_recent_idx on public.leads (ip_hash, created_at) where ip_hash is not null;
create index leads_created_idx on public.leads (created_at);

alter table public.leads enable row level security;

-- Public forms insert only: no select, so a submission can never be read back.
create policy "leads: public submits" on public.leads for insert to anon, authenticated
  with check (status = 'new' and assigned_to is null);
create policy "leads: staff read" on public.leads for select to authenticated using (public.is_staff());
create policy "leads: admin manages" on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.leads from anon, authenticated;
grant insert (kind, name, email, phone, message, listing_key, city_slug, payload, consent_contact, site, ip_hash)
  on public.leads to anon, authenticated;
grant select, update on public.leads to authenticated;

-- Abuse limits: 5 per email per hour, 5 per IP hash per 10 minutes.
create function public.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.status := 'new';
  new.assigned_to := null;
  if (select count(*) from leads where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'lead_rate_limited' using errcode = 'P0001', hint = 'email';
  end if;
  if new.ip_hash is not null and
     (select count(*) from leads where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'lead_rate_limited' using errcode = 'P0001', hint = 'ip';
  end if;
  return new;
end;
$$;

revoke execute on function public.leads_before_insert() from public, anon, authenticated;

create trigger leads_before_insert before insert on public.leads
  for each row execute function public.leads_before_insert();

-- Retention: leads older than 24 months are deleted. S6 schedules this.
create function public.purge_old_leads(p_months integer default 24)
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (delete from leads where created_at < now() - make_interval(months => p_months) returning 1)
  select count(*)::integer from gone;
$$;

revoke execute on function public.purge_old_leads(integer) from public, anon, authenticated;
grant execute on function public.purge_old_leads(integer) to service_role;

-- Public MLS read API ------------------------------------------------------------------------

-- MLS-1: last successful sync, for "last updated" on every page with MLS data.
create function public.mls_last_updated()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(finished_at) from mls_sync_runs where status = 'succeeded' and kind in ('incremental', 'reconcile');
$$;

grant execute on function public.mls_last_updated() to anon, authenticated;

-- IDX search. Security invoker: mls_listings RLS applies (no Closed for the
-- public). For-sale statuses only; sold search is VOW (S5). No demographic
-- parameters (FH-1). Street is returned only when the address may be shown.
create function public.search_listings(
  p_cities text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_beds integer default null,
  p_min_baths integer default null,
  p_sub_types text[] default null,
  p_own_only boolean default false,
  p_open_houses_only boolean default false,
  p_bbox double precision[] default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  listing_key text,
  listing_id text,
  standard_status text,
  property_type text,
  property_sub_type text,
  list_price numeric,
  street text,
  city text,
  postal_code text,
  bedrooms_total integer,
  bathrooms_total integer,
  living_area numeric,
  latitude double precision,
  longitude double precision,
  list_office_name text,
  is_own_listing boolean,
  address_display boolean,
  on_market_date date,
  modification_ts timestamptz,
  photo_url text,
  photo_storage_path text,
  next_open_house_start timestamptz,
  next_open_house_end timestamptz,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with base as (
    select l.*,
      (select oh.start_time from mls_open_houses oh
        where oh.listing_key = l.listing_key and oh.end_time >= now() order by oh.start_time limit 1) as oh_start,
      (select oh.end_time from mls_open_houses oh
        where oh.listing_key = l.listing_key and oh.end_time >= now() order by oh.start_time limit 1) as oh_end
    from mls_listings l
    where l.standard_status in ('Active', 'ActiveUnderContract', 'Pending')
      and (p_cities is null or l.city in (select unnest(c.mls_city_names) from cities c where c.slug = any(p_cities)))
      and (p_min_price is null or l.list_price >= p_min_price)
      and (p_max_price is null or l.list_price <= p_max_price)
      and (p_min_beds is null or l.bedrooms_total >= p_min_beds)
      and (p_min_baths is null or l.bathrooms_total >= p_min_baths)
      and (p_sub_types is null or l.property_sub_type = any(p_sub_types))
      and (not p_own_only or l.is_own_listing)
      and (p_bbox is null or (
        array_length(p_bbox, 1) = 4
        and l.longitude between p_bbox[1] and p_bbox[3]
        and l.latitude between p_bbox[2] and p_bbox[4]))
  )
  select
    b.listing_key,
    b.listing_id,
    b.standard_status,
    b.property_type,
    b.property_sub_type,
    b.list_price,
    case when b.address_display then
      coalesce(
        nullif(concat_ws(' ', b.data ->> 'StreetNumber', b.data ->> 'StreetName', b.data ->> 'StreetSuffix',
          case when b.data ->> 'UnitNumber' is not null then '#' || (b.data ->> 'UnitNumber') end), ''),
        split_part(b.data ->> 'UnparsedAddress', ',', 1))
    end,
    b.city,
    b.postal_code,
    b.bedrooms_total,
    b.bathrooms_total,
    b.living_area,
    case when b.address_display then b.latitude end,
    case when b.address_display then b.longitude end,
    b.list_office_name,
    b.is_own_listing,
    b.address_display,
    (b.data ->> 'OnMarketDate')::date,
    b.modification_ts,
    (select m.url from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    (select m.storage_path from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    b.oh_start,
    b.oh_end,
    count(*) over ()
  from base b
  where not p_open_houses_only or b.oh_start is not null
  order by
    case when p_sort = 'price_asc' then b.list_price end asc nulls last,
    case when p_sort = 'price_desc' then b.list_price end desc nulls last,
    case when p_sort = 'beds' then b.bedrooms_total end desc nulls last,
    case when p_sort = 'open_house' then b.oh_start end asc nulls last,
    (b.data ->> 'OnMarketDate')::date desc nulls last,
    b.modification_ts desc,
    b.listing_key
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_listings(text[], numeric, numeric, integer, integer, text[], boolean, boolean,
  double precision[], text, integer, integer) to anon, authenticated;

-- MLS-10: the source for our own sold listings on public pages. Returns
-- nothing while `public_sold` is off. Includes only what a public sold tile
-- shows (close price and date come from the VOW field set).
create function public.public_own_sold(p_limit integer default 12)
returns table (
  listing_key text,
  street text,
  city text,
  postal_code text,
  property_sub_type text,
  bedrooms_total integer,
  bathrooms_total integer,
  close_price numeric,
  close_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select l.listing_key,
    case when l.address_display then split_part(l.data ->> 'UnparsedAddress', ',', 1) end,
    l.city, l.postal_code, l.property_sub_type, l.bedrooms_total, l.bathrooms_total,
    (v.data ->> 'ClosePrice')::numeric,
    (v.data ->> 'CloseDate')::date
  from mls_listings l
  join mls_listing_vow v using (listing_key)
  where public.flag_enabled('public_sold')
    and l.is_own_listing
    and l.standard_status = 'Closed'
  order by (v.data ->> 'CloseDate')::date desc nulls last
  limit least(greatest(coalesce(p_limit, 12), 1), 48);
$$;

grant execute on function public.public_own_sold(integer) to anon, authenticated;
