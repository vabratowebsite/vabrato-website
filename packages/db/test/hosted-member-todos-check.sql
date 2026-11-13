-- "My to-dos" for the HOSTED project (0037). Run after applying 0037: Supabase
-- SQL editor, or the Supabase MCP execute_sql. No model is called and nothing
-- is sent.
--
-- It creates a fictional agent, a second agent and two buyers (one assigned
-- to the agent), then switches to authenticated / anon per person. It always
-- ends with RAISE EXCEPTION: the "error" message carries the results as JSON,
-- and the abort rolls back every row it created.
--
-- Expected:
--   flag "ai_member_summarize=false"
--   buyer_adds "allowed", buyer_for_other "denied…", buyer_approved "denied…", agent_adds "denied…"
--   alerts_to_agent 1 (two to-dos, one alert)
--   buyer2_sees 0, agent2_sees 0, agent_sees 2
--   agent2_decides "denied: not_found", buyer_decides "denied: staff_only"
--   agent_decides "approved,declined", audit 2
--   buyer_done "true", buyer_done_pending "denied: not_found"
--   deleted 1 (the declined one), left "approved", anon "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000037c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000037c2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000037f1';
  buyer2 uuid := 'f2000000-0000-4000-8000-0000000037f2';
  out jsonb := '{}';
  r text; n int; a uuid; b uuid;
begin
  out := out || jsonb_build_object('flag', (select string_agg(key || '=' || enabled, ',') from feature_flags where key = 'ai_member_summarize'));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0037-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0037-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0037-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer2, 'check-0037-buyer2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'buyer', agent_id = agent where id = buyer;
  update profiles set role = 'buyer' where id = buyer2;

  -- The buyer adds two to-dos.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin
    insert into member_todos (profile_id, title, source_name, page) values (buyer, 'Repair GFCI outlets', 'Inspection report.pdf', 14) returning id into a;
    insert into member_todos (profile_id, title, source_name, page) values (buyer, 'Strap the water heater', 'Inspection report.pdf', 22) returning id into b;
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_adds', r);
  begin insert into member_todos (profile_id, title) values (buyer2, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_for_other', r);
  begin insert into member_todos (profile_id, title, status) values (buyer, 'x', 'approved'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_approved', r);
  reset role;
  out := out || jsonb_build_object('alerts_to_agent', (select count(*) from staff_notifications where recipient_id = agent and kind = 'member_todo'));

  -- The other buyer and the other agent see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer2::text, true);
  set local role authenticated;
  select count(*) into n from member_todos; out := out || jsonb_build_object('buyer2_sees', n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from member_todos; out := out || jsonb_build_object('agent2_sees', n);
  begin perform public.decide_member_todo(a, true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_decides', r);
  begin insert into member_todos (profile_id, title) values (agent2, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_adds', r);
  reset role;

  -- The buyer can't decide; the agent approves one and declines the other.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin perform public.decide_member_todo(a, true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_decides', r);
  begin perform public.set_my_todo_done(a, true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_done_pending', r);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  select count(*) into n from member_todos; out := out || jsonb_build_object('agent_sees', n);
  perform public.decide_member_todo(a, true);
  perform public.decide_member_todo(b, false);
  out := out || jsonb_build_object('agent_decides', (select string_agg(status, ',' order by status) from member_todos));
  reset role;
  out := out || jsonb_build_object('audit', (select count(*) from staff_audit where actor_id = agent and action in ('approve_member_todo', 'decline_member_todo')));

  -- The buyer ticks the approved one and deletes their assistant data.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  perform public.set_my_todo_done(a, true);
  out := out || jsonb_build_object('buyer_done', (select done from member_todos where id = a));
  out := out || jsonb_build_object('deleted', public.delete_my_assistant_data());
  out := out || jsonb_build_object('left', (select string_agg(status, ',') from member_todos));
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from member_todos; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0037 %', out;
end $$;
