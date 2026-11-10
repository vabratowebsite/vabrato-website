-- S5 PR 5: seller portal data.
--
-- * deals.listing_key: staff link a deal to its MLS listing (agent console).
-- * listing_views_daily: our own page views of Vabrato's listings, one per
--   visitor (hashed IP) per listing per day, capped per visitor. Written only
--   by record_listing_view(), which needs the website server's key: the
--   browser can't call it with the public key alone (review item 10).
-- * open_house_signin_links: one unguessable link per open house, created by
--   staff; the sign-in page and form work only with it, and only on the day
--   of the event (review item 10).
-- * listing_performance(deal): weekly views, saves, tour requests and
--   open-house sign-ins for the deal's listing, for people on the deal and
--   their staff. Counts only, never who. MLS fields are IDX level (status and
--   list price); nothing VOW or FULL.

-- Deal ↔ listing ---------------------------------------------------------------

alter table public.deals
  add column listing_key text check (listing_key is null or listing_key ~ '^[A-Za-z0-9._-]{1,64}$');

create index deals_listing_idx on public.deals (listing_key) where listing_key is not null;

-- Listing views -----------------------------------------------------------------

create table public.listing_views_daily (
  listing_key text not null check (char_length(listing_key) <= 64),
  day date not null,
  views integer not null default 0 check (views >= 0),
  primary key (listing_key, day)
);

-- Who has been counted today (hashed IP only; kept two days).
create table public.listing_view_visitors (
  day date not null,
  visitor text not null check (visitor ~ '^[0-9a-f]{64}$'),
  listing_key text not null,
  primary key (day, visitor, listing_key)
);

-- sha256 (hex) of the website server's key, LISTING_VIEW_SECRET. No rows: no
-- views are recorded.
create table public.listing_view_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.listing_views_daily enable row level security;
alter table public.listing_view_visitors enable row level security;
alter table public.listing_view_keys enable row level security;
revoke all on public.listing_views_daily, public.listing_view_visitors, public.listing_view_keys from anon, authenticated;

-- Called by the website's /api/listing-view route (bots already skipped).
-- Returns true when the view counted.
create function public.record_listing_view(p_listing_key text, p_visitor text, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if p_key is null or not exists (
    select 1 from listing_view_keys where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Only Vabrato's own listings are counted.
  if not exists (select 1 from mls_listings where listing_key = p_listing_key and is_own_listing) then
    return false;
  end if;
  -- At most 50 listings per visitor per day.
  if (select count(*) from listing_view_visitors where day = d and visitor = p_visitor) >= 50 then
    return false;
  end if;
  insert into listing_view_visitors (day, visitor, listing_key) values (d, p_visitor, p_listing_key)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  insert into listing_views_daily (listing_key, day, views) values (p_listing_key, d, 1)
  on conflict (listing_key, day) do update set views = listing_views_daily.views + 1;
  delete from listing_view_visitors where day < d - 1;
  return true;
end;
$$;

-- Open-house sign-in links ---------------------------------------------------------

create table public.open_house_signin_links (
  open_house_key text primary key references public.mls_open_houses (open_house_key) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.open_house_signin_links enable row level security;

create policy "open_house_signin_links: staff read"
  on public.open_house_signin_links for select to authenticated
  using (public.is_staff());

revoke all on public.open_house_signin_links from anon, authenticated;
grant select on public.open_house_signin_links to authenticated;

-- Open-house sign-ins come only through the link (submit_open_house_signin
-- below), never as a plain public insert.
drop policy "leads: public submits" on public.leads;
create policy "leads: public submits" on public.leads for insert to anon, authenticated
  with check (
    status = 'new' and assigned_to is null
    and kind <> 'open_house_signin'
    and (profile_id is null or profile_id = auth.uid())
  );

-- Staff get (or create) the sign-in link for an open house on one of
-- Vabrato's own listings.
create function public.open_house_signin_link(p_open_house_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid;
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from mls_open_houses o join mls_listings l using (listing_key)
    where o.open_house_key = p_open_house_key and l.is_own_listing
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into open_house_signin_links (open_house_key, created_by) values (p_open_house_key, auth.uid())
  on conflict (open_house_key) do nothing;
  select token into t from open_house_signin_links where open_house_key = p_open_house_key;
  return t;
end;
$$;

-- The event behind a sign-in link, for the sign-in page. `accepting` is true
-- only on the day of the open house (Pacific time).
create function public.open_house_signin_info(p_token uuid)
returns table (
  open_house_key text,
  listing_key text,
  street text,
  city text,
  start_time timestamptz,
  end_time timestamptz,
  accepting boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select o.open_house_key, o.listing_key,
    case when l.address_display then split_part(l.data ->> 'UnparsedAddress', ',', 1) end,
    l.city, o.start_time, o.end_time,
    coalesce((o.start_time at time zone 'America/Los_Angeles')::date, o.open_house_date)
      = (now() at time zone 'America/Los_Angeles')::date
  from open_house_signin_links s
  join mls_open_houses o using (open_house_key)
  join mls_listings l on l.listing_key = o.listing_key
  where s.token = p_token and l.is_own_listing;
$$;

-- A visitor signs in at the open house (the agent's tablet). Stored as a lead;
-- the per-email limit applies; no IP limit, since every visitor shares the
-- tablet's IP. At most 300 sign-ins per event.
create function public.submit_open_house_signin(
  p_token uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_consent_contact boolean,
  p_has_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  select * into ev from public.open_house_signin_info(p_token);
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not ev.accepting then
    raise exception 'signin_closed' using errcode = 'P0001';
  end if;
  if (select count(*) from leads where kind = 'open_house_signin' and payload ->> 'open_house_key' = ev.open_house_key) >= 300 then
    raise exception 'lead_rate_limited' using errcode = 'P0001';
  end if;
  insert into leads (kind, name, email, phone, listing_key, payload, consent_contact, site)
  values (
    'open_house_signin',
    nullif(btrim(p_name), ''),
    lower(btrim(p_email)),
    nullif(btrim(p_phone), ''),
    ev.listing_key,
    jsonb_build_object('open_house_key', ev.open_house_key)
      || case when p_has_agent in ('yes', 'no') then jsonb_build_object('has_agent', p_has_agent) else '{}'::jsonb end,
    coalesce(p_consent_contact, false),
    'vabrato'
  );
end;
$$;

-- Listing performance -------------------------------------------------------------

create function public.listing_performance(p_deal uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text;
  today date := (now() at time zone 'America/Los_Angeles')::date;
  first_week date := date_trunc('week', today)::date - 49;
  result jsonb;
begin
  if not public.has_deal_access(p_deal) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select listing_key into k from deals where id = p_deal;
  if k is null then
    return jsonb_build_object('linked', false);
  end if;

  select jsonb_build_object(
    'linked', true,
    'listing_key', k,
    'listing', (
      select jsonb_build_object('standard_status', l.standard_status, 'list_price', l.list_price)
      from mls_listings l where l.listing_key = k
    ),
    'totals', jsonb_build_object(
      'views', coalesce((select sum(views) from listing_views_daily where listing_key = k), 0),
      'saves', (select count(*) from saved_homes where listing_key = k),
      'tour_requests', (select count(*) from leads where listing_key = k and kind = 'tour'),
      'open_house_signins', (select count(*) from leads where listing_key = k and kind = 'open_house_signin')
    ),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week_start', w::date,
        'views', coalesce((select sum(views) from listing_views_daily v where v.listing_key = k and v.day >= w::date and v.day < w::date + 7), 0),
        'saves', (select count(*) from saved_homes s where s.listing_key = k
                   and (s.created_at at time zone 'America/Los_Angeles')::date >= w::date
                   and (s.created_at at time zone 'America/Los_Angeles')::date < w::date + 7),
        'tour_requests', (select count(*) from leads l where l.listing_key = k and l.kind = 'tour'
                   and (l.created_at at time zone 'America/Los_Angeles')::date >= w::date
                   and (l.created_at at time zone 'America/Los_Angeles')::date < w::date + 7),
        'open_house_signins', (select count(*) from leads l where l.listing_key = k and l.kind = 'open_house_signin'
                   and (l.created_at at time zone 'America/Los_Angeles')::date >= w::date
                   and (l.created_at at time zone 'America/Los_Angeles')::date < w::date + 7)
      ) order by w)
      from generate_series(first_week, date_trunc('week', today)::date, interval '1 week') w
    )
  ) into result;
  return result;
end;
$$;

-- Function privileges ---------------------------------------------------------------

revoke execute on function public.record_listing_view(text, text, text) from public, authenticated;
revoke execute on function public.open_house_signin_link(text) from public, anon;
revoke execute on function public.open_house_signin_info(uuid) from public;
revoke execute on function public.submit_open_house_signin(uuid, text, text, text, boolean, text) from public;
revoke execute on function public.listing_performance(uuid) from public, anon;

grant execute on function public.record_listing_view(text, text, text) to anon;
grant execute on function public.open_house_signin_link(text) to authenticated;
grant execute on function public.open_house_signin_info(uuid) to anon, authenticated;
grant execute on function public.submit_open_house_signin(uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.listing_performance(uuid) to authenticated;
