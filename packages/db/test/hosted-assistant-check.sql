-- VA assistant check for the HOSTED project (0027), plus the console's deal
-- creation path (fixed in S6b PR 2). Run after any change to the AI switches
-- or the deal policies: Supabase SQL editor, or the Supabase MCP execute_sql.
-- No model is called and nothing is sent: the budget alert only writes
-- in-console rows.
--
-- It creates a fictional agent, VA and buyer and switches to anon /
-- authenticated per person. It always ends with RAISE EXCEPTION: the "error"
-- message carries the results as JSON, and the abort rolls back every row,
-- flag, setting and alert it changed. Needs at least one admin profile.
--
-- Expected (2026-11-12):
--   flags_before "ai_enabled=false,ai_staff_contract_reader=false"
--   sql_turns_on_without_zdr "denied: zdr_not_confirmed"
--   agent_confirms_zdr, agent_sets_flag, agent_month_summary "denied: admin_only"
--   admin_empty_note "denied: note_required", admin_bad_flag "denied: not_an_ai_flag"
--   admin_turns_on_without_zdr "denied: zdr_not_confirmed"
--   admin_turns_on_after_zdr "allowed", audit "confirm_ai_zdr,set_ai_flag:ai_enabled,set_ai_flag:ai_staff_contract_reader"
--   alerts_after_85pct 1 per admin (80%), alerts_after_105pct 2 per admin (80% then 100%)
--   paused_at_budget reason "monthly_budget", month_summary requests 2
--   va_own_intake "allowed", va_other_intake "denied", buyer_intake "denied", va_reads_agents_upload 0
--   va_creates_deal "allowed" (tasks 1, contingencies 1), va_insert_returning "denied: …row-level security…"
--   anon_can_execute all false
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000027c1';
  va uuid := 'e1000000-0000-4000-8000-0000000027e1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000027f1';
  deal uuid := '00000000-0000-4000-8000-0000000027d1';
  admin_id uuid;
  admins int;
  out jsonb := '{}';
  j jsonb; r text; n int; run uuid;
begin
  out := out || jsonb_build_object('flags_before', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key like 'ai\_%'));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0027-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (va, 'check-0027-va@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0027-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set role = 'agent' where id = agent;
  update public.profiles set role = 'va' where id = va;
  update public.profiles set role = 'buyer' where id = buyer;
  select id into admin_id from profiles where role = 'admin' limit 1;
  select count(*) into admins from profiles where role = 'admin';
  -- Start from no confirmation, whatever hosted holds (rolled back at the end).
  update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null;

  -- The gate holds even for direct SQL.
  begin update feature_flags set enabled = true where key = 'ai_enabled'; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('sql_turns_on_without_zdr', r);

  -- A non-admin can't confirm, switch or read the month.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin perform public.confirm_ai_zdr('check'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_confirms_zdr', r);
  begin perform public.set_ai_flag('ai_enabled', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_sets_flag', r);
  begin perform public.ai_month_summary(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_month_summary', r);
  reset role;

  -- The admin: the gate, then confirm and switch on (audited).
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  begin perform public.confirm_ai_zdr('   '); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_empty_note', r);
  begin perform public.set_ai_flag('public_sold', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_bad_flag', r);
  begin perform public.set_ai_flag('ai_enabled', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_turns_on_without_zdr', r);
  perform public.confirm_ai_zdr('CHECK_0027 fictional note, rolled back');
  begin
    perform public.set_ai_flag('ai_enabled', true);
    perform public.set_ai_flag('ai_staff_contract_reader', true);
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_turns_on_after_zdr', r);
  perform public.set_ai_limits(p_monthly_budget_usd => 1);
  reset role;
  out := out || jsonb_build_object('audit', (select string_agg(action || coalesce(':' || ref_id, ''), ',' order by id) from staff_audit where actor_id = admin_id and action in ('confirm_ai_zdr', 'set_ai_flag') and created_at >= now()));

  -- Budget $1: a VA's $0.85 request passes 80%, a $0.20 one reaches it.
  perform set_config('request.jwt.claims', json_build_object('sub', va, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', va::text, true);
  set local role authenticated;
  j := public.ai_begin('staff_contract_reader'); run := (j ->> 'run_id')::uuid;
  perform public.ai_finish(run, 'ok', 'claude-opus-5-5', 61000, 900, 0, 850000, 1000);
  reset role;
  select count(*) into n from staff_notifications where kind = 'ai_budget' and created_at >= now();
  out := out || jsonb_build_object('alerts_after_85pct', n, 'admins', admins);
  set local role authenticated;
  j := public.ai_begin('staff_contract_reader'); run := (j ->> 'run_id')::uuid;
  perform public.ai_finish(run, 'ok', 'claude-opus-5-5', 61000, 900, 0, 200000, 1000);
  j := public.ai_begin('staff_contract_reader'); out := out || jsonb_build_object('paused_at_budget', j);
  reset role;
  select count(*) into n from staff_notifications where kind = 'ai_budget' and created_at >= now();
  out := out || jsonb_build_object('alerts_after_105pct', n, 'alert_titles', (select string_agg(distinct title, ' | ') from staff_notifications where kind = 'ai_budget' and created_at >= now()));
  out := out || jsonb_build_object('alerts_to_non_admins', (select count(*) from staff_notifications s join profiles p on p.id = s.recipient_id where s.kind = 'ai_budget' and s.created_at >= now() and p.role <> 'admin'));

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  j := public.ai_month_summary(); out := out || jsonb_build_object('month_summary_requests', j -> 'requests', 'month_summary_spent', j -> 'spent_micros');
  reset role;

  -- The contract staging folder: own folder only.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into storage.objects (bucket_id, name, owner) values ('deal-docs', 'intake/' || agent || '/check.pdf', agent); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_own_intake', r);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', va, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', va::text, true);
  set local role authenticated;
  begin insert into storage.objects (bucket_id, name, owner) values ('deal-docs', 'intake/' || va || '/check.pdf', va); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('va_own_intake', r);
  begin insert into storage.objects (bucket_id, name, owner) values ('deal-docs', 'intake/' || agent || '/other.pdf', va); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('va_other_intake', r);
  select count(*) into n from storage.objects where bucket_id = 'deal-docs' and name like 'intake/' || agent || '/%';
  out := out || jsonb_build_object('va_reads_agents_upload', n);

  -- Creating a transaction the console's way works for a VA; reading the row back in the same statement doesn't.
  begin
    insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id)
    values (deal, '1 Fictional Way, San Carlos (check)', 'normal', '2026-03-02', 30, 0, va);
    insert into tasks (deal_id, title, owner, phase, offset_days, due_date) values (deal, 'Open escrow', 'Escrow', 'after_ratification', 0, '2026-03-02');
    insert into deal_contingencies (deal_id, kind, offset_days, due_date) values (deal, 'financing', 17, '2026-03-19');
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('va_creates_deal', r,
    'va_deal_tasks', (select count(*) from tasks where deal_id = deal), 'va_deal_contingencies', (select count(*) from deal_contingencies where deal_id = deal));
  begin
    insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id)
    values ('2 Fictional Way, San Carlos (check)', 'normal', '2026-03-02', 30, 0, va) returning id into run;
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('va_insert_returning', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin insert into storage.objects (bucket_id, name, owner) values ('deal-docs', 'intake/' || buyer || '/check.pdf', buyer); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('buyer_intake', r);
  reset role;

  out := out || jsonb_build_object('anon_can_execute', jsonb_build_object(
    'confirm_ai_zdr', has_function_privilege('anon', 'public.confirm_ai_zdr(text)', 'execute'),
    'set_ai_flag', has_function_privilege('anon', 'public.set_ai_flag(text, boolean)', 'execute'),
    'ai_month_summary', has_function_privilege('anon', 'public.ai_month_summary()', 'execute'),
    'feature_flags_ai_guard', has_function_privilege('authenticated', 'public.feature_flags_ai_guard()', 'execute')));

  -- Abort on purpose so everything above is rolled back.
  raise exception 'CHECK_0027 %', out;
end $$;
