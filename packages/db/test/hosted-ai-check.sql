-- AI foundations check for the HOSTED project (0026). Run after any change to
-- the AI switches, limits or usage log: Supabase SQL editor, or the Supabase
-- MCP execute_sql. No model is called.
--
-- It creates a fictional agent and buyer and two check-only feature flags,
-- turns the master switch on inside the transaction, and switches to anon /
-- authenticated per person. It always ends with RAISE EXCEPTION: the "error"
-- message carries the results as JSON, and the abort rolls back every row,
-- flag and limit it changed. Needs at least one admin profile.
--
-- Expected (2026-11-12):
--   master_off {"allowed": false, "reason": "off"}
--   agent_staff_feature "true", agent_member_feature "denied: not_allowed"
--   buyer_staff_feature "denied: not_allowed", buyer_first "true",
--   buyer_second reason "daily_requests" (limit set to 1 for the check)
--   finish_twice and buyer_closes_agents_run "denied: not_found"
--   agent_reads_log 0, agent_writes_log "denied", admin_reads_log 2
--   agent_sets_limits "denied: admin_only", budget_zero reason "monthly_budget"
--   anon_begin "denied"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000026c1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000026f1';
  admin_id uuid;
  out jsonb := '{}';
  j jsonb; r text; n int; run uuid;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0026-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0026-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set role = 'agent' where id = agent;
  update public.profiles set role = 'buyer' where id = buyer;
  select id into admin_id from profiles where role = 'admin' limit 1;
  insert into feature_flags (key, description, enabled) values ('ai_staff_check_feature', 'check only', true), ('ai_member_check_feature', 'check only', true);

  -- Master switch off: nothing runs.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  j := public.ai_begin('staff_check_feature'); out := out || jsonb_build_object('master_off', j);
  reset role;

  update feature_flags set enabled = true where key = 'ai_enabled';
  update app_settings set ai_daily_requests_member = 1;

  set local role authenticated;
  j := public.ai_begin('staff_check_feature'); run := (j ->> 'run_id')::uuid;
  out := out || jsonb_build_object('agent_staff_feature', j ->> 'allowed');
  begin perform public.ai_begin('member_check_feature'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_member_feature', r);
  perform public.ai_finish(run, 'ok', 'claude-opus-5-5', 5000, 400, 0, 28000, 900);
  begin perform public.ai_finish(run, 'ok'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('finish_twice', r);
  select count(*) into n from ai_runs; out := out || jsonb_build_object('agent_reads_log', n);
  begin insert into ai_runs (profile_id, feature) values (agent, 'staff_check_feature'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('agent_writes_log', r);
  begin perform public.set_ai_limits(p_monthly_budget_usd => 9999); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_sets_limits', r);
  out := out || jsonb_build_object('agent_usage', public.ai_usage_today());
  reset role;

  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin perform public.ai_begin('staff_check_feature'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_staff_feature', r);
  j := public.ai_begin('member_check_feature'); out := out || jsonb_build_object('buyer_first', j ->> 'allowed');
  j := public.ai_begin('member_check_feature'); out := out || jsonb_build_object('buyer_second', j);
  begin perform public.ai_finish(run, 'ok'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_closes_agents_run', r);
  reset role;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  select count(*) into n from ai_runs; out := out || jsonb_build_object('admin_reads_log', n);
  perform public.set_ai_limits(p_monthly_budget_usd => 0);
  reset role;
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  j := public.ai_begin('staff_check_feature'); out := out || jsonb_build_object('budget_zero', j);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin perform public.ai_begin('member_check_feature'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_begin', r);
  reset role;

  -- Abort on purpose so everything above is rolled back.
  raise exception 'CHECK_0026 %', out;
end $$;
