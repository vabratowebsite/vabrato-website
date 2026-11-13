-- Ask Vabrato switches for the HOSTED project (0036). Run after applying
-- 0036: Supabase SQL editor, or the Supabase MCP execute_sql. No model is
-- called and nothing is sent.
--
-- It creates a fictional buyer, seller and agent, turns the master switch and
-- the two member switches on inside the transaction, and switches to
-- authenticated / anon per person. It always ends with RAISE EXCEPTION: the
-- "error" message carries the results as JSON, and the abort rolls back every
-- row, flag and setting it changed.
--
-- Expected:
--   flags "ai_member_explain=false,ai_member_search=false"
--   off_buyer {"allowed": false, "reason": "off"}
--   buyer_explain "true", buyer_search "true", seller_explain "true"
--   agent_explain "denied: not_allowed", buyer_flag "denied: admin_only"
--   buyer_third reason "daily_requests" (limit set to 2 for the check)
--   buyer_reads_log 0, seller_reads_log 0, anon_begin "denied…"
do $$
declare
  buyer uuid := 'f1000000-0000-4000-8000-0000000036f1';
  seller uuid := 'e1000000-0000-4000-8000-0000000036e1';
  agent uuid := 'c1000000-0000-4000-8000-0000000036c1';
  out jsonb := '{}';
  j jsonb; r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_member_explain', 'ai_member_search')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (buyer, 'check-0036-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0036-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent, 'check-0036-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'buyer' where id = buyer;
  update profiles set role = 'seller' where id = seller;
  update profiles set role = 'agent' where id = agent;

  -- Switches as shipped (off): nothing runs.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('off_buyer', public.ai_begin('member_explain'));
  reset role;

  -- On, inside this transaction only.
  update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_requests_member = 2;
  update feature_flags set enabled = true where key in ('ai_enabled', 'ai_member_explain', 'ai_member_search');

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  j := public.ai_begin('member_explain'); out := out || jsonb_build_object('buyer_explain', j->>'allowed');
  j := public.ai_begin('member_search'); out := out || jsonb_build_object('buyer_search', j->>'allowed');
  j := public.ai_begin('member_explain'); out := out || jsonb_build_object('buyer_third', j);
  begin perform public.set_ai_flag('ai_member_explain', false); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_flag', r);
  select count(*) into n from ai_runs; out := out || jsonb_build_object('buyer_reads_log', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  j := public.ai_begin('member_explain'); out := out || jsonb_build_object('seller_explain', j->>'allowed');
  select count(*) into n from ai_runs; out := out || jsonb_build_object('seller_reads_log', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin perform public.ai_begin('member_explain'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_explain', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin perform public.ai_begin('member_explain'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_begin', r);
  reset role;

  raise exception 'CHECK_0036 %', out;
end $$;
