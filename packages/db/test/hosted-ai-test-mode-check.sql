-- AI test mode for the HOSTED project (0044). Run after applying 0044:
-- Supabase SQL editor, or the Supabase MCP execute_sql. No model is called.
--
-- It creates a fictional admin, a tester agent, a non-tester agent and a
-- tester buyer, a test deal and a real deal, turns test mode on, and asks the
-- gate. It always ends with RAISE EXCEPTION: the "error" message carries the
-- results as JSON, and the abort rolls back every change it made.
--
-- Expected (as of 0044; from 0046 on, tester_listing_kit and buyer_compare
-- are allowed while every MLS row is fictional: see
-- hosted-ai-test-mock-mls-check.sql):
--   test_mode_before false, ai_enabled_before false
--   lock "denied: is_test_locked"
--   agent_sets_tester "denied: admin_only"
--   tester_test_deal true, tester_real_deal "test_only", tester_contract_reader true,
--   tester_briefing "test_only", tester_lead_reply "test_only", tester_listing_kit "test_only"
--   non_tester "off", buyer_explain true, buyer_compare "test_only"
--   ui_tester {"mode":"test","features":{"staff_daily_briefing":false,"staff_document_check":true}}
--   ui_non_tester {"mode":"off","features":{"staff_document_check":false}}
--   master_still_guarded "denied: zdr_not_confirmed"
--   tester_briefing_on_test_deal "test_only"
--   runs 3, audit 3
do $$
declare
  admin uuid := 'a1000000-0000-4000-8000-0000000044a1';
  tester uuid := 'c1000000-0000-4000-8000-0000000044c1';
  other uuid := 'c2000000-0000-4000-8000-0000000044c2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000044f1';
  test_deal uuid := 'da000000-0000-4000-8000-0000000044d1';
  real_deal uuid := 'da000000-0000-4000-8000-0000000044d2';
  out jsonb := '{}';
  r text;
  runs_before integer := (select count(*) from ai_runs);
  audit_before integer := (select count(*) from staff_audit);
begin
  out := out || jsonb_build_object('test_mode_before', public.flag_enabled('ai_test_mode'), 'ai_enabled_before', public.flag_enabled('ai_enabled'));
  insert into auth.users (id, email, instance_id, aud, role) values
    (admin, 'check-0044-admin@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (tester, 'check-0044-tester@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (other, 'check-0044-other@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0044-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin' where id = admin;
  update profiles set role = 'agent' where id in (tester, other);
  insert into deals (id, address, ratification_date, agent_id, created_by, is_test) values
    (test_deal, 'TEST — 1 Fictional Way', current_date, tester, tester, true),
    (real_deal, '2 Fictional Way', current_date, tester, tester, false);
  begin update deals set is_test = true where id = real_deal; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('lock', r);

  -- The tester agent can't make testers.
  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  begin perform public.set_ai_tester('check-0044-tester@example.test', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_sets_tester', r);
  reset role;

  -- The admin turns test mode on and names the testers.
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  perform public.set_ai_flag('ai_test_mode', true);
  perform public.set_ai_tester('check-0044-tester@example.test', true);
  perform public.set_ai_tester('check-0044-buyer@example.test', true);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', tester, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tester::text, true);
  set local role authenticated;
  out := out || jsonb_build_object(
    'tester_test_deal', (public.ai_begin('staff_document_check', test_deal) ->> 'allowed')::boolean,
    'tester_real_deal', public.ai_begin('staff_document_check', real_deal) ->> 'reason',
    'tester_contract_reader', (public.ai_begin('staff_contract_reader', null) ->> 'allowed')::boolean,
    'tester_briefing', public.ai_begin('staff_daily_briefing', null) ->> 'reason',
    'tester_briefing_on_test_deal', public.ai_begin('staff_daily_briefing', test_deal) ->> 'reason',
    'tester_lead_reply', public.ai_begin('staff_lead_reply', null) ->> 'reason',
    'tester_listing_kit', public.ai_begin('staff_listing_kit', null) ->> 'reason',
    'ui_tester', public.ai_features_available(array['staff_document_check', 'staff_daily_briefing'], test_deal));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('non_tester', public.ai_begin('staff_contract_reader', null) ->> 'reason',
    'ui_non_tester', public.ai_features_available(array['staff_document_check'], null));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('buyer_explain', (public.ai_begin('member_explain', null) ->> 'allowed')::boolean,
    'buyer_compare', public.ai_begin('member_compare', null) ->> 'reason');
  reset role;

  begin update feature_flags set enabled = true where key = 'ai_enabled'; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('master_still_guarded', r);

  out := out || jsonb_build_object('runs', (select count(*) from ai_runs) - runs_before, 'audit', (select count(*) from staff_audit) - audit_before);
  raise exception 'hosted 0044 check (rolled back): %', out::text;
end;
$$;
