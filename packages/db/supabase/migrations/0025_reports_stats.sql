-- S6 PR 5: seller weekly report, market statistics, CMAs.
--
-- * Seller weekly report (live): the same counts as the seller's listing
--   performance page (views, saves, tour requests, open-house sign-ins) for
--   one finished week, in a static email template. Staff with access to the
--   deal review it and press Send; it goes to the deal's sellers once per
--   deal per week (seller_report_sends), audited. No MLS fields beyond the
--   listing's status and list price (IDX).
-- * Market statistics: aggregates of sold listings per city (counts,
--   medians, sale-to-list, days on market, months of inventory). Any median
--   built on fewer than 5 sales is withheld. Console: staff only, and only
--   with market_stats_enabled (off). Public city pages: public_city_stats()
--   returns nothing unless public_stats is on (MLS-10, off).
-- * CMAs: comparable sold listings for verified agents (ACC-1) with
--   cma_enabled (off). A saved CMA stores the agent's subject details and
--   the chosen listing keys only, never MLS fields; it is rebuilt from the
--   feed when opened, so comps that leave the feed show as missing (MLS-9).
--
-- Data reality (Nov 10): VOW sold data isn't licensed yet, so stats and CMAs
-- run on fictional fixtures until MLSListings confirms in writing.

insert into public.feature_flags (key, description) values
  ('market_stats_enabled', 'Market statistics in the agent console (sold-data aggregates). Off until MLSListings confirms sold data and derivative statistics in writing.'),
  ('cma_enabled', 'CMAs and comparable sales in the agent console for verified agents. Off until MLSListings confirms sold data in writing.')
on conflict (key) do nothing;

-- Seller weekly report -------------------------------------------------------------------------

create table public.seller_report_sends (
  deal_id uuid not null references public.deals (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now(),
  recipients integer not null check (recipients > 0),
  primary key (deal_id, week_start)
);

alter table public.seller_report_sends enable row level security;
create policy "seller_report_sends: staff with deal access read"
  on public.seller_report_sends for select to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));
revoke all on public.seller_report_sends from anon, authenticated;
grant select on public.seller_report_sends to authenticated;

-- One finished week (Monday to Sunday, Pacific) of listing activity for a
-- deal, plus totals since listing. Staff with access to the deal only.
create function public.seller_weekly_report_data(p_deal uuid, p_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
  this_week date := date_trunc('week', today)::date;
  w date := coalesce(p_week_start, this_week - 7);
  d deals;
  k text;
begin
  if not (public.is_staff() and public.has_deal_access(p_deal)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if extract(isodow from w) <> 1 or w >= this_week or w < this_week - 7 * 26 then
    raise exception 'bad_week' using errcode = '22023';
  end if;
  select * into d from deals where id = p_deal;
  k := d.listing_key;
  return jsonb_build_object(
    'deal_id', d.id,
    'address', d.address,
    'linked', k is not null,
    'week_start', w,
    'week_end', w + 6,
    'listing', (select jsonb_build_object('standard_status', l.standard_status, 'list_price', round(l.list_price)) from mls_listings l where l.listing_key = k),
    'week', jsonb_build_object(
      'views', coalesce((select sum(views) from listing_views_daily v where v.listing_key = k and v.day >= w and v.day < w + 7), 0),
      'saves', (select count(*) from saved_homes s where s.listing_key = k
                 and (s.created_at at time zone 'America/Los_Angeles')::date >= w and (s.created_at at time zone 'America/Los_Angeles')::date < w + 7),
      'tour_requests', (select count(*) from leads l where l.listing_key = k and l.kind = 'tour'
                 and (l.created_at at time zone 'America/Los_Angeles')::date >= w and (l.created_at at time zone 'America/Los_Angeles')::date < w + 7),
      'open_house_signins', (select count(*) from leads l where l.listing_key = k and l.kind = 'open_house_signin'
                 and (l.created_at at time zone 'America/Los_Angeles')::date >= w and (l.created_at at time zone 'America/Los_Angeles')::date < w + 7)
    ),
    'totals', jsonb_build_object(
      'views', coalesce((select sum(views) from listing_views_daily v where v.listing_key = k and v.day < w + 7), 0),
      'saves', (select count(*) from saved_homes s where s.listing_key = k and (s.created_at at time zone 'America/Los_Angeles')::date < w + 7),
      'tour_requests', (select count(*) from leads l where l.listing_key = k and l.kind = 'tour' and (l.created_at at time zone 'America/Los_Angeles')::date < w + 7),
      'open_house_signins', (select count(*) from leads l where l.listing_key = k and l.kind = 'open_house_signin' and (l.created_at at time zone 'America/Los_Angeles')::date < w + 7)
    ),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object('first_name', public.lead_first_name(p.full_name, null)) order by p.created_at)
      from deal_members m join profiles p on p.id = m.profile_id
      where m.deal_id = p_deal and m.member_role = 'seller'
    ), '[]'),
    'sent', (select jsonb_build_object('sent_at', s.sent_at, 'sent_by', s.sent_by, 'recipients', s.recipients)
             from seller_report_sends s where s.deal_id = p_deal and s.week_start = w)
  );
end;
$$;

-- Queue the report email to every seller on the deal. Once per deal per week.
create function public.send_seller_weekly_report(p_deal uuid, p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  data jsonb;
  w date;
  seller record;
  n integer := 0;
begin
  data := public.seller_weekly_report_data(p_deal, p_week_start);
  if not (data ->> 'linked')::boolean then
    raise exception 'not_linked' using errcode = '22023';
  end if;
  w := (data ->> 'week_start')::date;
  if exists (select 1 from seller_report_sends where deal_id = p_deal and week_start = w) then
    raise exception 'already_sent' using errcode = '23505';
  end if;
  for seller in
    select p.id, public.lead_first_name(p.full_name, null) as first_name
    from deal_members m join profiles p on p.id = m.profile_id
    where m.deal_id = p_deal and m.member_role = 'seller'
  loop
    insert into notifications (deal_id, recipient_profile_id, template_key, payload, send_at, dedupe_key)
    values (p_deal, seller.id, 'seller_weekly_report',
      jsonb_build_object(
        'sellerName', coalesce(seller.first_name, ''),
        'address', data ->> 'address',
        'weekStart', data ->> 'week_start',
        'weekEnd', data ->> 'week_end',
        'views', data #>> '{week,views}',
        'saves', data #>> '{week,saves}',
        'tourRequests', data #>> '{week,tour_requests}',
        'openHouseSignins', data #>> '{week,open_house_signins}',
        'totalViews', data #>> '{totals,views}',
        'totalSaves', data #>> '{totals,saves}',
        'totalTourRequests', data #>> '{totals,tour_requests}',
        'totalOpenHouseSignins', data #>> '{totals,open_house_signins}',
        'status', coalesce(data #>> '{listing,standard_status}', ''),
        'listPrice', coalesce(data #>> '{listing,list_price}', '')
      ),
      now(), 'seller_weekly:' || p_deal || ':' || w || ':' || seller.id)
    on conflict (dedupe_key) do nothing;
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'no_sellers' using errcode = '22023';
  end if;
  insert into seller_report_sends (deal_id, week_start, sent_by, recipients) values (p_deal, w, auth.uid(), n);
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'send_seller_weekly_report', 'deals', p_deal::text, jsonb_build_object('week_start', w, 'recipients', n));
  begin
    perform public.poke_notification_sender();
  exception when others then
    insert into notification_errors (source, detail) values ('seller_weekly:' || p_deal, left(sqlerrm, 1000));
  end;
  return n;
end;
$$;

-- Market statistics -------------------------------------------------------------------------------

-- Aggregates only; never exposed directly (callers: market_stats,
-- public_city_stats). Medians and ratios need at least 5 sales.
create function public.market_stats_compute(p_slug text, p_months integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c cities;
  months integer := least(greatest(coalesce(p_months, 12), 1), 36);
  since date := ((now() at time zone 'America/Los_Angeles')::date - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36)))::date;
  result jsonb;
begin
  select * into c from cities where slug = p_slug;
  if not found then
    return null;
  end if;
  with sold as (
    select (v.data ->> 'ClosePrice')::numeric as close_price,
           (v.data ->> 'CloseDate')::date as close_date,
           l.list_price,
           l.living_area,
           coalesce((v.data ->> 'DaysOnMarket')::integer, (v.data ->> 'CloseDate')::date - (l.data ->> 'OnMarketDate')::date) as dom
    from mls_listings l
    join mls_listing_vow v on v.listing_key = l.listing_key
    where l.standard_status = 'Closed'
      and l.city = any(c.mls_city_names)
      and v.data ? 'ClosePrice' and v.data ? 'CloseDate'
      and (v.data ->> 'CloseDate')::date >= since
  ),
  agg as (
    select count(*) as n,
      percentile_cont(0.5) within group (order by close_price) as median_price,
      percentile_cont(0.5) within group (order by close_price / nullif(living_area, 0)) filter (where living_area > 0) as median_ppsf,
      count(*) filter (where living_area > 0) as n_ppsf,
      percentile_cont(0.5) within group (order by dom) filter (where dom is not null and dom >= 0) as median_dom,
      count(*) filter (where dom is not null and dom >= 0) as n_dom,
      percentile_cont(0.5) within group (order by close_price / nullif(list_price, 0)) filter (where list_price > 0) as median_sale_to_list,
      count(*) filter (where list_price > 0) as n_stl
    from sold
  ),
  market as (
    select count(*) filter (where standard_status = 'Active') as active,
           count(*) filter (where standard_status in ('ActiveUnderContract', 'Pending')) as pending,
           percentile_cont(0.5) within group (order by list_price) filter (where standard_status = 'Active' and list_price > 0) as median_list,
           count(*) filter (where standard_status = 'Active' and list_price > 0) as n_list
    from mls_listings where city = any(c.mls_city_names) and standard_status in ('Active', 'ActiveUnderContract', 'Pending')
  ),
  by_month as (
    select m::date as month,
           (select count(*) from sold s where date_trunc('month', s.close_date) = m) as sold,
           (select case when count(*) >= 5 then round(percentile_cont(0.5) within group (order by s.close_price)) end
              from sold s where date_trunc('month', s.close_date) = m) as median_price
    from generate_series(date_trunc('month', since), date_trunc('month', (now() at time zone 'America/Los_Angeles')::date), interval '1 month') m
  )
  select jsonb_build_object(
    'city', c.slug,
    'city_name', c.name,
    'months', months,
    'since', since,
    'min_sales_for_medians', 5,
    'sold', jsonb_build_object(
      'count', a.n,
      'median_price', case when a.n >= 5 then round(a.median_price) end,
      'median_price_per_sqft', case when a.n_ppsf >= 5 then round(a.median_ppsf) end,
      'median_days_on_market', case when a.n_dom >= 5 then round(a.median_dom) end,
      'median_sale_to_list', case when a.n_stl >= 5 then round(a.median_sale_to_list::numeric, 3) end
    ),
    'market', jsonb_build_object(
      'active', mk.active,
      'pending', mk.pending,
      'median_list_price', case when mk.n_list >= 5 then round(mk.median_list) end,
      'months_of_inventory', case when a.n >= 5 then round(mk.active / (a.n::numeric / months), 1) end
    ),
    'by_month', (select jsonb_agg(jsonb_build_object('month', b.month, 'sold', b.sold, 'median_price', b.median_price) order by b.month) from by_month b)
  ) into result
  from agg a, market mk;
  return result;
end;
$$;

-- Console: staff, with market_stats_enabled. Returns {"enabled": false} while off.
create function public.market_stats(p_slug text, p_months integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not public.flag_enabled('market_stats_enabled') then
    return jsonb_build_object('enabled', false);
  end if;
  r := public.market_stats_compute(p_slug, p_months);
  if r is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r || jsonb_build_object('enabled', true);
end;
$$;

-- Public city pages: nothing unless public_stats is on (MLS-10). Last 12 months.
create function public.public_city_stats(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.flag_enabled('public_stats') then public.market_stats_compute(p_slug, 12) end;
$$;

-- CMAs ---------------------------------------------------------------------------------------------

-- ACC-1 verified agent (active MLSListings member of our office, checked
-- within 36 hours), without the FULL flag that has_full_mls_access() needs.
create function public.has_verified_mls_access()
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

-- Comparable sold listings. Empty unless cma_enabled is on and the caller
-- is a verified agent. With p_keys, returns those listings (still sold and
-- in the feed) and ignores the other criteria. Hidden addresses stay hidden
-- (MLS-3).
create function public.cma_comps(
  p_city_slugs text[] default null,
  p_sub_types text[] default null,
  p_min_beds integer default null,
  p_max_beds integer default null,
  p_min_baths integer default null,
  p_min_sqft numeric default null,
  p_max_sqft numeric default null,
  p_months integer default 6,
  p_keys text[] default null,
  p_limit integer default 30
)
returns table (
  listing_key text,
  street text,
  city text,
  property_sub_type text,
  bedrooms_total integer,
  bathrooms_total integer,
  living_area numeric,
  list_price numeric,
  close_price numeric,
  close_date date,
  days_on_market integer,
  price_per_sqft numeric,
  list_office_name text,
  is_own_listing boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.listing_key,
    case when l.address_display then
      coalesce(
        nullif(concat_ws(' ', l.data ->> 'StreetNumber', l.data ->> 'StreetName', l.data ->> 'StreetSuffix',
          case when l.data ->> 'UnitNumber' is not null then '#' || (l.data ->> 'UnitNumber') end), ''),
        split_part(l.data ->> 'UnparsedAddress', ',', 1))
    end,
    l.city, l.property_sub_type, l.bedrooms_total, l.bathrooms_total, l.living_area, l.list_price,
    (v.data ->> 'ClosePrice')::numeric,
    (v.data ->> 'CloseDate')::date,
    coalesce((v.data ->> 'DaysOnMarket')::integer, (v.data ->> 'CloseDate')::date - (l.data ->> 'OnMarketDate')::date),
    case when l.living_area > 0 then round((v.data ->> 'ClosePrice')::numeric / l.living_area) end,
    l.list_office_name, l.is_own_listing
  from mls_listings l
  join mls_listing_vow v on v.listing_key = l.listing_key
  where public.flag_enabled('cma_enabled')
    and public.has_verified_mls_access()
    and l.standard_status = 'Closed'
    and v.data ? 'ClosePrice' and v.data ? 'CloseDate'
    and (
      (p_keys is not null and l.listing_key = any(p_keys[1:12]))
      or (p_keys is null
        and (v.data ->> 'CloseDate')::date >= (now() at time zone 'America/Los_Angeles')::date - make_interval(months => least(greatest(coalesce(p_months, 6), 1), 24))
        and (p_city_slugs is null or l.city in (select unnest(c.mls_city_names) from cities c where c.slug = any(p_city_slugs)))
        and (p_sub_types is null or l.property_sub_type = any(p_sub_types))
        and (p_min_beds is null or l.bedrooms_total >= p_min_beds)
        and (p_max_beds is null or l.bedrooms_total <= p_max_beds)
        and (p_min_baths is null or l.bathrooms_total >= p_min_baths)
        and (p_min_sqft is null or l.living_area >= p_min_sqft)
        and (p_max_sqft is null or l.living_area <= p_max_sqft))
    )
  order by (v.data ->> 'CloseDate')::date desc, l.listing_key
  limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;

-- A saved CMA: the agent's subject details and chosen listing keys only.
create function public.cma_subject_ok(s jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(s) = 'object'
    and pg_column_size(s) <= 4096
    and not exists (
      select 1 from jsonb_object_keys(s) k
      where k not in ('city_slug', 'sub_type', 'beds', 'baths', 'sqft', 'min_beds', 'max_beds', 'min_baths', 'min_sqft', 'max_sqft', 'months', 'notes')
    )
    and coalesce(char_length(s ->> 'notes'), 0) <= 2000;
$$;

create table public.cmas (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject jsonb not null default '{}' check (public.cma_subject_ok(subject)),
  comp_keys text[] not null default '{}' check (
    cardinality(comp_keys) <= 12
    and array_to_string(comp_keys, ',') ~ '^([A-Za-z0-9._-]{1,64}(,|$))*$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cmas_created_by_idx on public.cmas (created_by, updated_at desc);

alter table public.cmas enable row level security;
create policy "cmas: own or admin read"
  on public.cmas for select to authenticated
  using (created_by = auth.uid() or public.is_admin());
create policy "cmas: verified agents create their own while CMAs are on"
  on public.cmas for insert to authenticated
  with check (created_by = auth.uid() and public.is_staff() and public.flag_enabled('cma_enabled') and public.has_verified_mls_access());
create policy "cmas: own update"
  on public.cmas for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid() and public.flag_enabled('cma_enabled'));
create policy "cmas: own or admin delete"
  on public.cmas for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());
revoke all on public.cmas from anon, authenticated;
grant select, delete on public.cmas to authenticated;
grant insert (title, subject, comp_keys), update (title, subject, comp_keys, updated_at) on public.cmas to authenticated;

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.seller_weekly_report_data(uuid, date) from public, anon;
revoke execute on function public.send_seller_weekly_report(uuid, date) from public, anon;
revoke execute on function public.market_stats_compute(text, integer) from public, anon, authenticated;
revoke execute on function public.market_stats(text, integer) from public, anon;
revoke execute on function public.public_city_stats(text) from public;
revoke execute on function public.has_verified_mls_access() from public, anon;
revoke execute on function public.cma_comps(text[], text[], integer, integer, integer, numeric, numeric, integer, text[], integer) from public, anon;
revoke execute on function public.cma_subject_ok(jsonb) from public, anon;

grant execute on function public.seller_weekly_report_data(uuid, date) to authenticated;
grant execute on function public.send_seller_weekly_report(uuid, date) to authenticated;
grant execute on function public.market_stats(text, integer) to authenticated;
grant execute on function public.public_city_stats(text) to anon, authenticated;
grant execute on function public.has_verified_mls_access() to authenticated;
grant execute on function public.cma_comps(text[], text[], integer, integer, integer, numeric, numeric, integer, text[], integer) to authenticated;
grant execute on function public.cma_subject_ok(jsonb) to authenticated;
