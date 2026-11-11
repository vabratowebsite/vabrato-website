-- Seller weekly report, market stats and CMA check for the HOSTED project
-- (0025). Run after any change to those functions or policies: Supabase SQL
-- editor, or the Supabase MCP execute_sql.
--
-- It creates a fictional cast (an agent on a deal, another agent, a seller,
-- a buyer, an unverified role admin), fictional sold listings in Belmont, and
-- switches to anon / authenticated per person. It always ends with RAISE
-- EXCEPTION: the "error" message carries the results as JSON, and the abort
-- rolls back every row it created and every flag it switched on. Make sure
-- nothing can send email while it runs (no Vault console secrets, or the
-- notification it queues is rolled back before the sender sees it).
--
-- Expected (2026-11-11):
--   agent_report_data "ok", agent2/seller/buyer report "denied: not_allowed"
--   agent_send 1 then agent_send_again "denied: already_sent", notification payload has no "@"
--   stats_off {"enabled": false}, buyer_stats "denied", anon_stats "denied"
--   stats_on sold.count 6 with a median; few_sales medians null
--   public_off null, public_on with a median
--   cma_off 0 rows, cma_unverified_admin 0 rows, cma_verified 6 rows
--   cma_bad_subject "denied", cma_saved "ok", other agent sees 0 CMAs
do $$
declare
  agent  uuid := 'c1000000-0000-4000-8000-0000000025c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000025c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000025e1';
  buyer  uuid := 'f1000000-0000-4000-8000-0000000025f1';
  admin2 uuid := 'a2000000-0000-4000-8000-0000000025a2';
  deal   uuid := 'da000000-0000-4000-8000-0000000025d1';
  listing text;
  out jsonb := '{}';
  r text; n int; j jsonb;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent,  'check-0025-agent@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0025-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0025-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer,  'check-0025-buyer@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (admin2, 'check-0025-admin@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set role = 'agent' where id in (agent, agent2);
  update public.profiles set role = 'seller', full_name = 'Check Seller' where id = seller;
  update public.profiles set role = 'buyer' where id = buyer;
  update public.profiles set role = 'admin' where id = admin2;
  select listing_key into listing from mls_listings where standard_status = 'Active' order by listing_key limit 1;
  insert into deals (id, address, ratification_date, agent_id, created_by, listing_key) values (deal, '1 Check Way (fictional)', current_date, agent, agent, listing);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');
  -- Fictional sold listings: 6 in Belmont, 3 in Brisbane.
  insert into mls_listings (listing_key, standard_status, list_price, city, county, living_area, address_display, modification_ts, data)
    select 'CHK-' || c || i, 'Closed', 1000000 + i * 100000, case c when 'B' then 'Belmont' else 'Brisbane' end, 'San Mateo', 1000, true, now(), '{}'
    from (values ('B'), ('R')) v(c), generate_series(1, 6) i where c = 'B' or i <= 3;
  insert into mls_listing_vow (listing_key, data)
    select listing_key, jsonb_build_object('ClosePrice', list_price, 'CloseDate', (current_date - 20)::text) from mls_listings where listing_key like 'CHK-%';
  insert into mls_members (member_key, full_name, email, member_status, office_mls_id) values ('CHK-MEMBER', 'Check Agent', 'check-0025-agent@example.test', 'Active', 'CHECK');
  insert into mls_agent_access (profile_id, member_key, active, verified_at) values (agent, 'CHK-MEMBER', true, now());

  -- Weekly report: the agent on the deal.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin perform public.seller_weekly_report_data(deal); r := 'ok'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_report_data', r);
  n := public.send_seller_weekly_report(deal);
  out := out || jsonb_build_object('agent_send', n);
  begin perform public.send_seller_weekly_report(deal); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_send_again', r);
  j := public.market_stats('belmont'); out := out || jsonb_build_object('stats_off', j);
  select count(*) into n from public.cma_comps(p_city_slugs => array['belmont']); out := out || jsonb_build_object('cma_off', n);
  reset role;
  select payload into j from notifications where dedupe_key like 'seller_weekly:' || deal || ':%';
  out := out || jsonb_build_object('payload_has_at_sign', position('@' in j::text) > 0, 'payload_views', j ->> 'views');

  -- Others can't read or send the report.
  for r in select unnest(array['agent2', 'seller', 'buyer']) loop
    perform set_config('request.jwt.claim.sub', (case r when 'agent2' then agent2 when 'seller' then seller else buyer end)::text, true);
    set local role authenticated;
    begin perform public.seller_weekly_report_data(deal); out := out || jsonb_build_object(r || '_report', 'allowed');
    exception when others then out := out || jsonb_build_object(r || '_report', 'denied: ' || sqlerrm); end;
    reset role;
  end loop;

  -- Stats and CMAs with the flags on.
  update feature_flags set enabled = true where key in ('market_stats_enabled', 'cma_enabled', 'public_stats');
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  j := public.market_stats('belmont'); out := out || jsonb_build_object('stats_on', j -> 'sold');
  j := public.market_stats('brisbane'); out := out || jsonb_build_object('few_sales', j -> 'sold');
  select count(*) into n from public.cma_comps(p_city_slugs => array['belmont']); out := out || jsonb_build_object('cma_verified', n);
  begin insert into cmas (title, subject) values ('x', '{"ClosePrice": 1}'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('cma_bad_subject', r);
  begin insert into cmas (title, subject, comp_keys) values ('Check CMA', '{"city_slug":"belmont","sqft":1200}', array['CHK-B1','CHK-B2']); r := 'ok'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('cma_saved', r);
  reset role;

  perform set_config('request.jwt.claim.sub', admin2::text, true);
  set local role authenticated;
  select count(*) into n from public.cma_comps(p_city_slugs => array['belmont']); out := out || jsonb_build_object('cma_unverified_admin', n);
  reset role;
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from cmas; out := out || jsonb_build_object('agent2_sees_cmas', n);
  reset role;
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin perform public.market_stats('belmont'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('buyer_stats', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  j := public.public_city_stats('belmont'); out := out || jsonb_build_object('public_on_median', j #> '{sold,median_price}');
  begin perform public.market_stats('belmont'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_stats', r);
  reset role;
  update feature_flags set enabled = false where key = 'public_stats';
  set local role anon;
  j := public.public_city_stats('belmont'); out := out || jsonb_build_object('public_off', j);
  reset role;

  -- Abort on purpose so every row above (and the flags) is rolled back.
  raise exception 'CHECK_0025 %', out;
end $$;
