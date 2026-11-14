-- Schedules for the HOSTED project (0040). Run after applying 0040: Supabase
-- SQL editor, or the Supabase MCP execute_sql. No model is called.
--
-- It creates a fictional admin, an agent and two buyers (one assigned to the
-- agent). It always ends with RAISE EXCEPTION: the "error" message carries the
-- results as JSON, and the abort rolls back every change it made.
--
-- Expected:
--   flags "ai_member_moving=false,ai_member_prelisting=false,ai_member_tour=false"
--   tour_before_approval "denied: mls_ai_not_approved"
--   tour_after_approval "true", tour_after_gate_off "false"
--   moving_without_approval "true"
--   buyer_adds_dated "allowed", dated "2026-12-01,2026-12-10", status "pending,pending", alert 1
--   buyer2_sees 0, agent_sees_dates "2026-12-01,2026-12-10"
--   buyer_approved "denied…", buyer_for_other "denied…", buyer_changes_date "denied…"
do $$
declare
  admin uuid := 'a1000000-0000-4000-8000-0000000040a1';
  agent uuid := 'c1000000-0000-4000-8000-0000000040c1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000040f1';
  buyer2 uuid := 'f2000000-0000-4000-8000-0000000040f2';
  out jsonb := '{}';
  r text; n int; a uuid;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_member_moving', 'ai_member_prelisting', 'ai_member_tour')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (admin, 'check-0040-admin@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent, 'check-0040-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0040-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer2, 'check-0040-buyer2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin' where id = admin;
  update profiles set role = 'agent' where id = agent;
  update profiles set role = 'buyer', agent_id = agent where id = buyer;
  update profiles set role = 'buyer' where id = buyer2;

  -- The tour-day switch under the MLSListings approval; the moving switch without it.
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  begin perform public.set_ai_flag('ai_member_tour', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('tour_before_approval', r);
  perform public.set_ai_flag('ai_mls_approved', true);
  perform public.set_ai_flag('ai_member_tour', true);
  reset role;
  out := out || jsonb_build_object('tour_after_approval', (select enabled from feature_flags where key = 'ai_member_tour'));
  set local role authenticated;
  perform public.set_ai_flag('ai_mls_approved', false);
  perform public.set_ai_flag('ai_member_moving', true);
  reset role;
  out := out || jsonb_build_object('tour_after_gate_off', (select enabled from feature_flags where key = 'ai_member_tour'));
  out := out || jsonb_build_object('moving_without_approval', (select enabled from feature_flags where key = 'ai_member_moving'));

  -- The buyer adds dated to-dos.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin
    insert into member_todos (profile_id, title, source_name, due_date) values (buyer, 'Book movers', 'Moving plan', '2026-12-01') returning id into a;
    insert into member_todos (profile_id, title, source_name, due_date) values (buyer, 'Forward mail', 'Moving plan', '2026-12-10');
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_adds_dated', r);
  begin insert into member_todos (profile_id, title, due_date, status) values (buyer, 'x', '2026-12-01', 'approved'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_approved', r);
  begin insert into member_todos (profile_id, title, due_date) values (buyer2, 'x', '2026-12-01'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_for_other', r);
  begin update member_todos set due_date = '2027-01-01' where id = a; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_changes_date', r);
  reset role;
  out := out || jsonb_build_object('dated', (select string_agg(due_date::text, ',' order by due_date) from member_todos where profile_id = buyer));
  out := out || jsonb_build_object('status', (select string_agg(status, ',') from member_todos where profile_id = buyer));
  out := out || jsonb_build_object('alert', (select count(*) from staff_notifications where recipient_id = agent and kind = 'member_todo'));

  perform set_config('request.jwt.claims', json_build_object('sub', buyer2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer2::text, true);
  set local role authenticated;
  select count(*) into n from member_todos; out := out || jsonb_build_object('buyer2_sees', n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('agent_sees_dates', (select string_agg(due_date::text, ',' order by due_date) from member_todos));
  reset role;

  raise exception 'CHECK_0040 %', out;
end $$;
