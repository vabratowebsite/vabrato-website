-- MLSListings data (S3). See docs/SPEC.md <mls_data>, MLS-1..MLS-10, ACC-1/2.
--
-- Data levels are stored per field set, one table per level:
--   mls_listings      IDX   public website, signed-out app, homes.sancarloslife.com
--   mls_listing_vow   VOW   members who accepted the VOW Terms (sold detail, price history)
--   mls_price_events  VOW   price / status history recorded by the sync
--   mls_listing_full  FULL  agent console, ACC-1-verified agents only
--   mls_members       FULL  office roster incl. contact details
-- Each row carries data_level with a check constraint, and `data` jsonb holds
-- only the fields on that level's allowlist (packages/mls/src/levels). The
-- sync drops every other field before it reaches the database (MLS-4).
--
-- All writes come from the Render sync job (service role / direct Postgres).
-- No insert/update/delete policies exist for API roles.

create type public.mls_data_level as enum ('IDX', 'VOW', 'FULL');
create type public.mls_sync_kind as enum ('incremental', 'reconcile', 'purge');
create type public.mls_sync_status as enum ('running', 'succeeded', 'failed');

-- IDX ------------------------------------------------------------------------

create table public.mls_listings (
  listing_key text primary key,
  listing_id text,
  -- MLS-8: only our own MLSListings feed, never commingled.
  source text not null default 'MLSListings' check (source = 'MLSListings'),
  standard_status text not null,
  property_type text,
  property_sub_type text,
  list_price numeric(14, 2),
  city text,
  county text,
  postal_code text,
  bedrooms_total integer,
  bathrooms_total integer,
  living_area numeric,
  -- Null when InternetAddressDisplayYN is false (MLS-3). PostGIS column + GIST
  -- index for map search arrive in S4.
  latitude double precision,
  longitude double precision,
  list_office_mls_id text,
  list_office_name text,
  list_agent_full_name text,
  -- list_office_mls_id = MLS_OFFICE_ID at sync time (config, not hard-coded).
  is_own_listing boolean not null default false,
  address_display boolean not null default true,
  avm_display boolean not null default true,
  comments_display boolean not null default true,
  modification_ts timestamptz not null,
  data jsonb not null default '{}',
  data_level public.mls_data_level not null default 'IDX' check (data_level = 'IDX'),
  synced_at timestamptz not null default now()
);

create index mls_listings_status_idx on public.mls_listings (standard_status);
create index mls_listings_city_idx on public.mls_listings (city);
create index mls_listings_modification_idx on public.mls_listings (modification_ts);
create index mls_listings_own_idx on public.mls_listings (standard_status) where is_own_listing;

create table public.mls_media (
  media_key text primary key,
  listing_key text not null references public.mls_listings (listing_key) on delete cascade,
  sort_order integer not null default 0,
  category text,
  -- Source MediaURL (hotlink mode) and our copy (copy mode, bucket mls-photos).
  url text,
  storage_path text,
  short_description text,
  width integer,
  height integer,
  modification_ts timestamptz,
  data_level public.mls_data_level not null default 'IDX' check (data_level = 'IDX')
);

create index mls_media_listing_idx on public.mls_media (listing_key, sort_order);

create table public.mls_open_houses (
  open_house_key text primary key,
  listing_key text not null references public.mls_listings (listing_key) on delete cascade,
  open_house_date date,
  start_time timestamptz,
  end_time timestamptz,
  remarks text,
  open_house_type text,
  modification_ts timestamptz,
  data_level public.mls_data_level not null default 'IDX' check (data_level = 'IDX')
);

create index mls_open_houses_listing_idx on public.mls_open_houses (listing_key);
create index mls_open_houses_start_idx on public.mls_open_houses (start_time);

create table public.mls_offices (
  office_key text primary key,
  office_mls_id text,
  name text,
  phone text,
  data jsonb not null default '{}',
  modification_ts timestamptz,
  data_level public.mls_data_level not null default 'IDX' check (data_level = 'IDX')
);

-- VOW ------------------------------------------------------------------------

create table public.mls_listing_vow (
  listing_key text primary key references public.mls_listings (listing_key) on delete cascade,
  data jsonb not null default '{}',
  data_level public.mls_data_level not null default 'VOW' check (data_level = 'VOW'),
  synced_at timestamptz not null default now()
);

create table public.mls_price_events (
  id bigint generated always as identity primary key,
  listing_key text not null references public.mls_listings (listing_key) on delete cascade,
  list_price numeric(14, 2),
  standard_status text,
  observed_at timestamptz not null,
  data_level public.mls_data_level not null default 'VOW' check (data_level = 'VOW')
);

create index mls_price_events_listing_idx on public.mls_price_events (listing_key, observed_at);

-- FULL -----------------------------------------------------------------------

create table public.mls_listing_full (
  listing_key text primary key references public.mls_listings (listing_key) on delete cascade,
  data jsonb not null default '{}',
  data_level public.mls_data_level not null default 'FULL' check (data_level = 'FULL'),
  synced_at timestamptz not null default now()
);

-- Office roster from the Member resource, filtered by MLS_OFFICE_ID.
create table public.mls_members (
  member_key text primary key,
  member_mls_id text,
  full_name text,
  email text,
  member_status text,
  office_mls_id text,
  data jsonb not null default '{}',
  modification_ts timestamptz,
  data_level public.mls_data_level not null default 'FULL' check (data_level = 'FULL')
);

create index mls_members_email_idx on public.mls_members (lower(email));

-- ACC-1: which signed-in profiles are verified active MLSListings members of
-- our office. Written by the verification code (sign-in in S6, nightly in the
-- reconcile). FULL access lapses on its own if the nightly re-check stops.
create table public.mls_agent_access (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  member_key text not null,
  active boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger mls_agent_access_updated_at
  before update on public.mls_agent_access
  for each row execute function public.set_updated_at();

-- Sync health log (console, S6) -------------------------------------------------

create table public.mls_sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind public.mls_sync_kind not null,
  status public.mls_sync_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Highest ModificationTimestamp applied; the next incremental starts here.
  high_water_mark timestamptz,
  counts jsonb not null default '{}',
  -- Sanitized message only: never credentials or record contents.
  error text
);

create index mls_sync_runs_recent_idx on public.mls_sync_runs (kind, started_at desc);
create index mls_sync_runs_status_idx on public.mls_sync_runs (status, finished_at desc);
-- At most one run at a time: a second job that starts while one is running is skipped.
create unique index mls_sync_runs_one_running on public.mls_sync_runs (status) where status = 'running';

-- Access helpers -----------------------------------------------------------------

create function public.has_full_mls_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from mls_agent_access a
    join mls_members m on m.member_key = a.member_key
    join profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid()
      and a.active
      and a.verified_at > now() - interval '36 hours'
      and m.member_status = 'Active'
      and p.role in ('admin', 'agent', 'va', 'tc')
  );
$$;

create function public.has_vow_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and vow_accepted_at is not null
  ) or public.has_full_mls_access();
$$;

revoke execute on function public.has_full_mls_access() from public, anon;
revoke execute on function public.has_vow_access() from public, anon;
grant execute on function public.has_full_mls_access() to authenticated;
grant execute on function public.has_vow_access() to authenticated;

-- Freshness for the console: stale when the last successful sync is older than
-- 30 minutes (SPEC <mls_data>). Security invoker: non-staff see nothing.
create function public.mls_sync_health()
returns table (
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_status public.mls_sync_status,
  stale boolean
)
language sql
stable
set search_path = public
as $$
  select
    (select max(finished_at) from mls_sync_runs where status = 'succeeded' and kind <> 'purge'),
    (select max(finished_at) from mls_sync_runs where status = 'failed'),
    (select status from mls_sync_runs order by started_at desc limit 1),
    coalesce(
      (select max(finished_at) from mls_sync_runs where status = 'succeeded' and kind <> 'purge')
        < now() - interval '30 minutes',
      true
    );
$$;

revoke execute on function public.mls_sync_health() from public, anon;
grant execute on function public.mls_sync_health() to authenticated;

-- RLS ---------------------------------------------------------------------------

alter table public.mls_listings enable row level security;
alter table public.mls_media enable row level security;
alter table public.mls_open_houses enable row level security;
alter table public.mls_offices enable row level security;
alter table public.mls_listing_vow enable row level security;
alter table public.mls_price_events enable row level security;
alter table public.mls_listing_full enable row level security;
alter table public.mls_members enable row level security;
alter table public.mls_agent_access enable row level security;
alter table public.mls_sync_runs enable row level security;

-- IDX: for-sale listings for everyone. Closed listings only for VOW members
-- (MLS-6), or our own sold listings once `public_sold` is on (MLS-10).
create policy "mls_listings: public reads for-sale and flagged own sold"
  on public.mls_listings for select to anon, authenticated
  using (
    standard_status <> 'Closed'
    or (is_own_listing and public.flag_enabled('public_sold'))
  );

create policy "mls_listings: VOW members read sold"
  on public.mls_listings for select to authenticated
  using (public.has_vow_access());

-- Media and open houses follow their listing (the subquery runs under the
-- caller's mls_listings policies).
create policy "mls_media: visible with listing"
  on public.mls_media for select to anon, authenticated
  using (exists (select 1 from public.mls_listings l where l.listing_key = mls_media.listing_key));

create policy "mls_open_houses: visible with listing"
  on public.mls_open_houses for select to anon, authenticated
  using (exists (select 1 from public.mls_listings l where l.listing_key = mls_open_houses.listing_key));

create policy "mls_offices: anyone reads"
  on public.mls_offices for select to anon, authenticated
  using (true);

create policy "mls_listing_vow: VOW members read"
  on public.mls_listing_vow for select to authenticated
  using (public.has_vow_access());

create policy "mls_price_events: VOW members read"
  on public.mls_price_events for select to authenticated
  using (public.has_vow_access());

create policy "mls_listing_full: verified agents read"
  on public.mls_listing_full for select to authenticated
  using (public.has_full_mls_access());

create policy "mls_members: verified agents read"
  on public.mls_members for select to authenticated
  using (public.has_full_mls_access());

create policy "mls_agent_access: own row or admin reads"
  on public.mls_agent_access for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

create policy "mls_sync_runs: staff read"
  on public.mls_sync_runs for select to authenticated
  using (public.is_staff());

-- Belt and braces: API roles never write MLS tables, and signed-out visitors
-- never touch the VOW / FULL / internal ones.
revoke insert, update, delete, truncate on
  public.mls_listings, public.mls_media, public.mls_open_houses, public.mls_offices,
  public.mls_listing_vow, public.mls_price_events, public.mls_listing_full,
  public.mls_members, public.mls_agent_access, public.mls_sync_runs
  from anon, authenticated;

revoke all on
  public.mls_listing_vow, public.mls_price_events, public.mls_listing_full,
  public.mls_members, public.mls_agent_access, public.mls_sync_runs
  from anon;
