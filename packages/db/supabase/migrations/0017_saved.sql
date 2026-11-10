-- S5 PR 2: saved homes, saved searches, and VOW reads for members.
--
-- * saved_homes keeps only (member, listing_key): no snapshot of MLS data,
--   no foreign key, so a save survives the listing leaving the feed and shows
--   as "no longer on the market" (review item 5).
-- * saved_searches stores the same filters as /search (validated in the app
--   with Zod; here: a JSON object of at most 4 KB). Alert frequency is used
--   by the alert job in PR 3.
-- * listing_cards(): card data for a member's saved keys, same columns and
--   eligibility as search_listings (for-sale only, hidden addresses honored).
-- * search_sold_listings(), listing_price_history(), listing_sold_detail():
--   VOW only. Security invoker (RLS applies) and they also check
--   has_vow_access(), which requires vow_enabled (0016), so they return
--   nothing while the flag is off (review item 1). Only VOW-allowlisted
--   fields (ClosePrice, CloseDate, OriginalListPrice, CumulativeDaysOnMarket).
-- * Members own their rows; staff who may see the member (can_see_member,
--   0016) can read them; anon sees nothing.

create type public.alert_frequency as enum ('instant', 'daily', 'off');

-- Saved homes ------------------------------------------------------------------

create table public.saved_homes (
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_key text not null check (listing_key ~ '^[A-Za-z0-9._-]{1,64}$'),
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_key)
);

create index saved_homes_listing_key_idx on public.saved_homes (listing_key);

alter table public.saved_homes enable row level security;

create policy "saved_homes: member reads own, staff who may see the member"
  on public.saved_homes for select to authenticated
  using (profile_id = auth.uid() or public.can_see_member(profile_id));

create policy "saved_homes: member adds own"
  on public.saved_homes for insert to authenticated
  with check (profile_id = auth.uid());

create policy "saved_homes: member removes own"
  on public.saved_homes for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.saved_homes from anon, authenticated;
grant select, insert, delete on public.saved_homes to authenticated;

-- Saved searches ---------------------------------------------------------------

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'object' and pg_column_size(criteria) <= 4096),
  frequency public.alert_frequency not null default 'instant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz
);

create index saved_searches_profile_idx on public.saved_searches (profile_id);

create trigger saved_searches_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

alter table public.saved_searches enable row level security;

create policy "saved_searches: member reads own, staff who may see the member"
  on public.saved_searches for select to authenticated
  using (profile_id = auth.uid() or public.can_see_member(profile_id));

create policy "saved_searches: member adds own"
  on public.saved_searches for insert to authenticated
  with check (profile_id = auth.uid());

create policy "saved_searches: member edits own"
  on public.saved_searches for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "saved_searches: member removes own"
  on public.saved_searches for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (name, criteria, frequency) on public.saved_searches to authenticated;
grant update (name, criteria, frequency) on public.saved_searches to authenticated;

-- Per-member limits (abuse guard; the app shows a friendly message).
create function public.member_saves_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'saved_homes'
     and (select count(*) from saved_homes where profile_id = new.profile_id) >= 500 then
    raise exception 'saved_homes_limit' using errcode = 'P0001';
  end if;
  if tg_table_name = 'saved_searches'
     and (select count(*) from saved_searches where profile_id = new.profile_id) >= 25 then
    raise exception 'saved_searches_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger saved_homes_limit before insert on public.saved_homes
  for each row execute function public.member_saves_limit();
create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function public.member_saves_limit();

-- Card data for saved keys (IDX, for-sale only) --------------------------------

create function public.listing_cards(p_keys text[])
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
    where l.listing_key = any(coalesce(p_keys[1:500], '{}'))
      and l.standard_status in ('Active', 'ActiveUnderContract', 'Pending')
  )
  select
    b.listing_key, b.listing_id, b.standard_status, b.property_type, b.property_sub_type, b.list_price,
    case when b.address_display then
      coalesce(
        nullif(concat_ws(' ', b.data ->> 'StreetNumber', b.data ->> 'StreetName', b.data ->> 'StreetSuffix',
          case when b.data ->> 'UnitNumber' is not null then '#' || (b.data ->> 'UnitNumber') end), ''),
        split_part(b.data ->> 'UnparsedAddress', ',', 1))
    end,
    b.city, b.postal_code, b.bedrooms_total, b.bathrooms_total, b.living_area,
    case when b.address_display then b.latitude end,
    case when b.address_display then b.longitude end,
    b.list_office_name, b.is_own_listing, b.address_display,
    (b.data ->> 'OnMarketDate')::date,
    b.modification_ts,
    (select m.url from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    (select m.storage_path from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    b.oh_start, b.oh_end,
    count(*) over ()
  from base b
  order by b.listing_key;
$$;

-- VOW: sold search, price history, sold detail ----------------------------------

create function public.search_sold_listings(
  p_cities text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_beds integer default null,
  p_min_baths integer default null,
  p_sub_types text[] default null,
  p_bbox double precision[] default null,
  p_closed_within_days integer default 365,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  listing_key text,
  listing_id text,
  property_type text,
  property_sub_type text,
  close_price numeric,
  close_date date,
  street text,
  city text,
  postal_code text,
  bedrooms_total integer,
  bathrooms_total integer,
  living_area numeric,
  list_office_name text,
  is_own_listing boolean,
  address_display boolean,
  photo_url text,
  photo_storage_path text,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with base as (
    select l.*, (v.data ->> 'ClosePrice')::numeric as close_price, (v.data ->> 'CloseDate')::date as close_date
    from mls_listings l
    join mls_listing_vow v on v.listing_key = l.listing_key
    where public.has_vow_access()
      and l.standard_status = 'Closed'
      and (v.data ->> 'CloseDate')::date >= current_date - least(greatest(coalesce(p_closed_within_days, 365), 1), 1825)
      and (p_cities is null or l.city in (select unnest(c.mls_city_names) from cities c where c.slug = any(p_cities)))
      and (p_min_price is null or (v.data ->> 'ClosePrice')::numeric >= p_min_price)
      and (p_max_price is null or (v.data ->> 'ClosePrice')::numeric <= p_max_price)
      and (p_min_beds is null or l.bedrooms_total >= p_min_beds)
      and (p_min_baths is null or l.bathrooms_total >= p_min_baths)
      and (p_sub_types is null or l.property_sub_type = any(p_sub_types))
      and (p_bbox is null or (
        array_length(p_bbox, 1) = 4
        and l.longitude between p_bbox[1] and p_bbox[3]
        and l.latitude between p_bbox[2] and p_bbox[4]))
  )
  select
    b.listing_key, b.listing_id, b.property_type, b.property_sub_type, b.close_price, b.close_date,
    case when b.address_display then
      coalesce(
        nullif(concat_ws(' ', b.data ->> 'StreetNumber', b.data ->> 'StreetName', b.data ->> 'StreetSuffix',
          case when b.data ->> 'UnitNumber' is not null then '#' || (b.data ->> 'UnitNumber') end), ''),
        split_part(b.data ->> 'UnparsedAddress', ',', 1))
    end,
    b.city, b.postal_code, b.bedrooms_total, b.bathrooms_total, b.living_area,
    b.list_office_name, b.is_own_listing, b.address_display,
    (select m.url from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    (select m.storage_path from mls_media m where m.listing_key = b.listing_key order by m.sort_order limit 1),
    count(*) over ()
  from base b
  order by b.close_date desc nulls last, b.listing_key
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.listing_price_history(p_key text)
returns table (observed_at timestamptz, list_price numeric, standard_status text)
language sql
stable
set search_path = public
as $$
  select e.observed_at, e.list_price, e.standard_status
  from mls_price_events e
  where public.has_vow_access() and e.listing_key = p_key
  order by e.observed_at, e.id;
$$;

create function public.listing_sold_detail(p_key text)
returns table (
  close_price numeric,
  close_date date,
  original_list_price numeric,
  cumulative_days_on_market integer
)
language sql
stable
set search_path = public
as $$
  select (v.data ->> 'ClosePrice')::numeric, (v.data ->> 'CloseDate')::date,
         (v.data ->> 'OriginalListPrice')::numeric, (v.data ->> 'CumulativeDaysOnMarket')::integer
  from mls_listing_vow v
  where public.has_vow_access() and v.listing_key = p_key;
$$;

-- Function privileges ----------------------------------------------------------

revoke execute on function public.member_saves_limit() from public, anon, authenticated;

revoke execute on function public.listing_cards(text[]) from public, anon;
revoke execute on function public.search_sold_listings(text[], numeric, numeric, integer, integer, text[], double precision[], integer, integer, integer) from public, anon;
revoke execute on function public.listing_price_history(text) from public, anon;
revoke execute on function public.listing_sold_detail(text) from public, anon;

grant execute on function public.listing_cards(text[]) to authenticated;
grant execute on function public.search_sold_listings(text[], numeric, numeric, integer, integer, text[], double precision[], integer, integer, integer) to authenticated;
grant execute on function public.listing_price_history(text) to authenticated;
grant execute on function public.listing_sold_detail(text) to authenticated;
