-- S5 PR 3: member alerts (new matches and price changes).
--
-- run_member_alerts() runs right after each incremental sync (Render; see
-- packages/mls/RENDER.md). It reads mls_price_events after a cursor, keeps
-- only listings that are displayable now (same for-sale statuses as
-- search_listings, IDX level), matches saved searches and saved homes,
-- records alert_deliveries (the "What changed" feed) and queues one email per
-- member through the existing notifications pipeline. Daily-digest searches
-- are emailed once a day after 16:00 UTC.
--
-- Data level (review item 3): deliveries store the new list price only. No
-- previous price and no close price are copied; Closed listings never alert.
-- Hidden addresses (MLS-3) are withheld in the email payload.
--
-- Cleanup (review item 5): deliveries reference mls_listings and go when the
-- listing leaves the feed (and with the MLS-9 purge); deliveries and alert
-- emails older than 90 days are deleted by purge_member_alert_data().
--
-- Unsubscribe (review item 15): every profile has a random, non-expiring
-- token; unsubscribe_alert_emails(token) is the only anon-callable action.

create type public.alert_kind as enum ('new_match', 'back_on_market', 'price_drop', 'price_change', 'status_change');

-- Unsubscribe tokens -----------------------------------------------------------

alter table public.profiles
  add column alerts_unsubscribe_token uuid not null default gen_random_uuid();

create unique index profiles_alerts_unsubscribe_token_idx on public.profiles (alerts_unsubscribe_token);

-- Notifications: dedupe and failure reason ------------------------------------

alter table public.notifications
  add column dedupe_key text unique,
  add column failure_reason text check (failure_reason is null or length(failure_reason) <= 500);

-- Deliveries ---------------------------------------------------------------------

create table public.alert_deliveries (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  saved_search_id uuid references public.saved_searches (id) on delete cascade,
  listing_key text not null references public.mls_listings (listing_key) on delete cascade,
  kind public.alert_kind not null,
  price_event_id bigint not null,
  new_price numeric,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  seen_at timestamptz,
  unique (profile_id, listing_key, price_event_id)
);

create index alert_deliveries_profile_idx on public.alert_deliveries (profile_id, created_at desc);
create index alert_deliveries_created_idx on public.alert_deliveries (created_at);
create index alert_deliveries_unemailed_idx on public.alert_deliveries (profile_id) where emailed_at is null;

alter table public.alert_deliveries enable row level security;

create policy "alert_deliveries: own, or staff who may see the member"
  on public.alert_deliveries for select to authenticated
  using (profile_id = auth.uid() or public.can_see_member(profile_id));

revoke all on public.alert_deliveries from anon, authenticated;
grant select on public.alert_deliveries to authenticated;

create function public.mark_alerts_seen()
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
  update alert_deliveries set seen_at = now() where profile_id = auth.uid() and seen_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cursor ---------------------------------------------------------------------------

create table public.alert_state (
  id boolean primary key default true check (id),
  last_price_event_id bigint,
  last_digest_on date,
  updated_at timestamptz not null default now()
);

insert into public.alert_state default values;

alter table public.alert_state enable row level security;
revoke all on public.alert_state from anon, authenticated;

-- Matching ----------------------------------------------------------------------

-- Saved-search criteria (the /search URL filters, stored by the app) against
-- one listing. Unknown or malformed values are ignored, as on /search.
create function public.listing_matches_criteria(p_listing_key text, p_criteria jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  with c as (
    select
      case when p_criteria ->> 'city' ~ '^[a-z0-9,-]+$' then string_to_array(p_criteria ->> 'city', ',') end as cities,
      case when p_criteria ->> 'minPrice' ~ '^[0-9]{1,9}$' then (p_criteria ->> 'minPrice')::numeric end as min_price,
      case when p_criteria ->> 'maxPrice' ~ '^[0-9]{1,9}$' then (p_criteria ->> 'maxPrice')::numeric end as max_price,
      case when p_criteria ->> 'beds' ~ '^[0-9]{1,2}$' then (p_criteria ->> 'beds')::integer end as beds,
      case when p_criteria ->> 'baths' ~ '^[0-9]{1,2}$' then (p_criteria ->> 'baths')::integer end as baths,
      (select array_agg(case t when 'house' then 'Single Family Residence' when 'condo' then 'Condominium'
                               when 'townhome' then 'Townhouse' when 'multi-family' then 'Multi Family' end)
         from unnest(string_to_array(p_criteria ->> 'type', ',')) t
        where t in ('house', 'condo', 'townhome', 'multi-family')) as sub_types,
      case when p_criteria ->> 'bbox' ~ '^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$'
           then string_to_array(p_criteria ->> 'bbox', ',')::double precision[] end as bbox,
      coalesce(p_criteria ->> 'tab' = 'open-houses', false) as open_houses
  )
  select exists (
    select 1 from mls_listings l, c
    where l.listing_key = p_listing_key
      and l.standard_status in ('Active', 'ActiveUnderContract', 'Pending')
      and (c.cities is null or l.city in (select unnest(ci.mls_city_names) from cities ci where ci.slug = any(c.cities)))
      and (c.min_price is null or l.list_price >= c.min_price)
      and (c.max_price is null or l.list_price <= c.max_price)
      and (c.beds is null or l.bedrooms_total >= c.beds)
      and (c.baths is null or l.bathrooms_total >= c.baths)
      and (c.sub_types is null or l.property_sub_type = any(c.sub_types))
      and (c.bbox is null or (l.longitude between c.bbox[1] and c.bbox[3] and l.latitude between c.bbox[2] and c.bbox[4]))
      and (not c.open_houses or exists (
        select 1 from mls_open_houses oh where oh.listing_key = l.listing_key and oh.end_time >= now()))
  );
$$;

-- Email item for one delivery: IDX fields only, hidden addresses withheld.
create function public.alert_email_item(p_delivery_id bigint)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'title', case when l.address_display then
        coalesce(nullif(concat_ws(' ', l.data ->> 'StreetNumber', l.data ->> 'StreetName', l.data ->> 'StreetSuffix',
          case when l.data ->> 'UnitNumber' is not null then '#' || (l.data ->> 'UnitNumber') end), ''),
          split_part(l.data ->> 'UnparsedAddress', ',', 1), 'Home in ' || coalesce(l.city, 'the area'))
      else 'Home in ' || coalesce(l.city, 'the area') end,
    'city', l.city,
    'price', d.new_price,
    'kind', d.kind,
    'status', l.standard_status,
    'search', s.name,
    'path', '/listing/' || l.listing_key,
    'broker', case when l.is_own_listing then null else l.list_office_name end
  )
  from alert_deliveries d
  join mls_listings l on l.listing_key = d.listing_key
  left join saved_searches s on s.id = d.saved_search_id
  where d.id = p_delivery_id;
$$;

-- Queues one email per member for their unemailed deliveries (instant ones,
-- or the daily digest). At most 10 homes per email; the rest are counted.
create function public.queue_alert_emails(p_digest boolean, p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ids bigint[];
  v_items jsonb;
  n integer := 0;
begin
  for r in
    select d.profile_id, p.full_name, p.alerts_unsubscribe_token as token,
           array_agg(d.id order by d.created_at, d.id) as ids
    from alert_deliveries d
    join profiles p on p.id = d.profile_id
    left join saved_searches s on s.id = d.saved_search_id
    where d.emailed_at is null
      and p.alerts_email_opt_in
      and d.created_at > p_now - interval '2 days'
      and (case when p_digest then s.frequency = 'daily'
                else d.saved_search_id is null or s.frequency = 'instant' end)
    group by d.profile_id, p.full_name, p.alerts_unsubscribe_token
  loop
    v_ids := r.ids;
    select jsonb_agg(public.alert_email_item(i) order by ord) into v_items
    from unnest(v_ids[1:10]) with ordinality as u(i, ord);
    insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
    values (
      r.profile_id,
      case when p_digest then 'buyer_alert_digest' else 'buyer_alert_instant' end,
      jsonb_build_object(
        'first_name', split_part(btrim(r.full_name), ' ', 1),
        'items', coalesce(v_items, '[]'::jsonb),
        'more', greatest(array_length(v_ids, 1) - 10, 0),
        'unsubscribe_token', r.token
      ),
      p_now,
      'alert:' || r.profile_id || ':' || v_ids[array_length(v_ids, 1)]
    )
    on conflict (dedupe_key) do nothing;
    update alert_deliveries set emailed_at = p_now where id = any(v_ids);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Deletes member copies of alert data: older than 90 days, or everything
-- (MLS-9 termination; deliveries also go with their listings).
create function public.purge_member_alert_data(p_all boolean default false)
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
  return jsonb_build_object('deliveries', d, 'emails', m);
end;
$$;

create function public.run_member_alerts(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state alert_state%rowtype;
  v_max bigint;
  v_new integer := 0;
  v_instant integer := 0;
  v_digest integer := 0;
  v_purged jsonb;
begin
  select * into v_state from alert_state where id for update;
  select coalesce(max(id), 0) into v_max from mls_price_events;

  -- First run: start from now; never alert on the initial load.
  if v_state.last_price_event_id is null then
    update alert_state set last_price_event_id = v_max, updated_at = p_now where id;
    return jsonb_build_object('initialized', true);
  end if;

  with ev as (
    select e.id as event_id, e.listing_key, e.list_price, e.standard_status,
           prev.id is null as first_event, prev.list_price as prev_price, prev.standard_status as prev_status
    from mls_price_events e
    left join lateral (
      select p.id, p.list_price, p.standard_status from mls_price_events p
      where p.listing_key = e.listing_key and p.id < e.id order by p.id desc limit 1
    ) prev on true
    where e.id > v_state.last_price_event_id and e.id <= v_max
  ),
  classified as (
    select ev.*,
      case
        when ev.first_event then
          case when (l.data ->> 'OnMarketDate') ~ '^\d{4}-\d{2}-\d{2}'
                    and (l.data ->> 'OnMarketDate')::date >= (p_now - interval '3 days')::date
               then 'new_match' end
        when ev.prev_status not in ('Active', 'ActiveUnderContract', 'Pending') then 'back_on_market'
        when ev.list_price < ev.prev_price then 'price_drop'
        when ev.list_price > ev.prev_price then 'price_change'
        when ev.standard_status is distinct from ev.prev_status then 'status_change'
      end::public.alert_kind as kind
    from ev
    join mls_listings l on l.listing_key = ev.listing_key
    -- Displayable now (IDX, for sale); Closed and other statuses never alert.
    where ev.standard_status in ('Active', 'ActiveUnderContract', 'Pending')
      and l.standard_status in ('Active', 'ActiveUnderContract', 'Pending')
  ),
  inserted as (
    insert into alert_deliveries (profile_id, saved_search_id, listing_key, kind, price_event_id, new_price, created_at)
    select m.profile_id, m.saved_search_id, m.listing_key, m.kind, m.event_id, m.list_price, p_now
    from (
      select s.profile_id, s.id as saved_search_id, c.listing_key, c.kind, c.event_id, c.list_price
      from classified c
      join saved_searches s on s.frequency <> 'off' and public.listing_matches_criteria(c.listing_key, s.criteria)
      where c.kind in ('new_match', 'back_on_market')
      union all
      select h.profile_id, null, c.listing_key, c.kind, c.event_id, c.list_price
      from classified c
      join saved_homes h on h.listing_key = c.listing_key
      where c.kind in ('back_on_market', 'price_drop', 'price_change', 'status_change')
    ) m
    on conflict (profile_id, listing_key, price_event_id) do nothing
    returning 1
  )
  select count(*) into v_new from inserted;

  update alert_state set last_price_event_id = v_max, updated_at = p_now where id;

  v_instant := public.queue_alert_emails(false, p_now);
  if p_now >= date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC' + interval '16 hours'
     and (v_state.last_digest_on is null or v_state.last_digest_on < (p_now at time zone 'UTC')::date) then
    v_digest := public.queue_alert_emails(true, p_now);
    update alert_state set last_digest_on = (p_now at time zone 'UTC')::date where id;
  end if;

  v_purged := public.purge_member_alert_data(false);
  return jsonb_build_object('deliveries', v_new, 'instant_emails', v_instant, 'digest_emails', v_digest, 'purged', v_purged);
end;
$$;

-- Unsubscribe (one click or the confirm page; review item 15) ----------------

create function public.unsubscribe_alert_emails(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update profiles set alerts_email_opt_in = false, alerts_opt_in_at = null
   where alerts_unsubscribe_token = p_token;
  get diagnostics n = row_count;
  -- Emails already queued for this member are cancelled too.
  if n > 0 then
    update notifications set status = 'cancelled'
     where status = 'scheduled'
       and template_key in ('buyer_alert_instant', 'buyer_alert_digest')
       and recipient_profile_id = (select id from profiles where alerts_unsubscribe_token = p_token);
  end if;
  return n > 0;
end;
$$;

-- Function privileges ----------------------------------------------------------
-- run_member_alerts and purge_member_alert_data are for the sync job (service
-- role, or the mls_sync role per RENDER.md); members only mark their own feed
-- seen; the unsubscribe link works signed out.

revoke execute on function public.listing_matches_criteria(text, jsonb) from public, anon, authenticated;
revoke execute on function public.alert_email_item(bigint) from public, anon, authenticated;
revoke execute on function public.queue_alert_emails(boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.purge_member_alert_data(boolean) from public, anon, authenticated;
revoke execute on function public.run_member_alerts(timestamptz) from public, anon, authenticated;
revoke execute on function public.mark_alerts_seen() from public, anon;
revoke execute on function public.unsubscribe_alert_emails(uuid) from public;

grant execute on function public.run_member_alerts(timestamptz) to service_role;
grant execute on function public.purge_member_alert_data(boolean) to service_role;
grant execute on function public.mark_alerts_seen() to authenticated;
grant execute on function public.unsubscribe_alert_emails(uuid) to anon, authenticated;
