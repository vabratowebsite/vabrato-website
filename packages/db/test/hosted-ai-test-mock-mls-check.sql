-- AI test mode with fictional MLS data, for the HOSTED project (0046). Run
-- after applying 0046: Supabase SQL editor, or the Supabase MCP execute_sql.
-- No model is called.
--
-- It creates a fictional admin, a tester agent, a non-tester agent and a
-- tester buyer, turns test mode on and asks the gate about the listing
-- features, first with the MLS rows as they are, then after adding one real
-- listing, agent or office row in turn. It always ends with RAISE EXCEPTION:
-- the "error" message carries the results as JSON, and the abort rolls back
-- every change it made.
--
-- Expected (hosted holds only the fictional preview listings):
--   real_rows_before {"listings":0,"members":0,"offices":0}
--   all_fictional true
--   tester_mock {"staff_listing_kit":true,"staff_presentations":true,"staff_market_update":true,"staff_cma_writeup":true}
--   buyer_mock {"member_compare":true,"member_listing":true,"member_tour":true}
--   non_tester_mock "off"
--   tester_briefing "test_only"
--   tester_real_listing "test_only", buyer_real_listing "test_only"
--   tester_real_member "test_only", tester_real_office "test_only"
--   ui_real_listing {"mode":"test","features":{"staff_presentations":false}}
--   direct_call "denied: permission denied for function mls_all_fictional"
do $$
declare
  admin uuid := 'a1000000-0000-4000-8000-0000000046a1';
  tester uuid := 'c1000000-0000-4000-8000-0000000046c1';
  other uuid := 'c2000000-0000-4000-8000-0000000046c2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000046f1';
  out jsonb := '{}';
  r text;
  staff_mls text[] := array['staff_listing_kit', 'staff_presentations', 'staff_market_update', 'staff_cma_writeup'];
  member_mls text[] := array['member_compare', 'member_listing', 'member_tour'];
  f text;
  answers jsonb;
begin
  out := out || jsonb_build_object('real_rows_before', jsonb_build_object(
    'listings', (select count(*) from mls_listings where source <> 'mock'),
    'members', (select count(*) from mls_members where source <> 'mock'),
    'offices', (select count(*) from mls_offices where source <> 'mock')),
    'all_fictional', public.mls_all_fictional());
  insert into auth.users (id, email, instance_id, aud, role) values
    (admin, 'check-0046-admin@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (tester, 'check-0046-tester@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (other, 'check-0046-other@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0046-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin' where id = admin;
  update profiles set role = 'agent' where id in (tester, other);

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  perform public.set_ai_flag('ai_test_mode', true);
  perform public.set_ai_tester('check-0046-tester@example.test', true);
  perform public.set_ai_tester('check-0046-buyer@example.test', true);
  reset role;

  -- As things are.
  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  answers := '{}';
  foreach f in array staff_mls loop answers := answers || jsonb_build_object(f, (public.ai_begin(f, null) ->> 'allowed')::boolean); end loop;
  out := out || jsonb_build_object('tester_mock', answers, 'tester_briefing', public.ai_begin('staff_daily_briefing', null) ->> 'reason');
  begin perform public.mls_all_fictional(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('direct_call', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  answers := '{}';
  foreach f in array member_mls loop answers := answers || jsonb_build_object(f, (public.ai_begin(f, null) ->> 'allowed')::boolean); end loop;
  out := out || jsonb_build_object('buyer_mock', answers);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('non_tester_mock', public.ai_begin('staff_presentations', null) ->> 'reason');
  reset role;

  -- One real listing locks them.
  insert into mls_listings (listing_key, standard_status, modification_ts) values ('CHECK-0046-REAL', 'Active', now());
  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('tester_real_listing', public.ai_begin('staff_presentations', null) ->> 'reason',
    'ui_real_listing', public.ai_features_available(array['staff_presentations'], null));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('buyer_real_listing', public.ai_begin('member_compare', null) ->> 'reason');
  reset role;
  delete from mls_listings where listing_key = 'CHECK-0046-REAL';

  -- So does one real agent, or one real office.
  insert into mls_members (member_key, full_name) values ('CHECK-0046-REAL', 'Fictional Check');
  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('tester_real_member', public.ai_begin('staff_market_update', null) ->> 'reason');
  reset role;
  delete from mls_members where member_key = 'CHECK-0046-REAL';
  insert into mls_offices (office_key, name) values ('CHECK-0046-REAL', 'Fictional Check Office');
  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('tester_real_office', public.ai_begin('staff_cma_writeup', null) ->> 'reason');
  reset role;

  raise exception 'hosted 0046 check (rolled back): %', out::text;
end;
$$;
