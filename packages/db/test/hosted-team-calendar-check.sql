-- The team Google Calendar, for the HOSTED project (0045). Run after applying
-- 0045: Supabase SQL editor, or the Supabase MCP execute_sql. Nothing is sent
-- to Google and no real token is used.
--
-- It creates a fictional admin, agent and seller, stores a placeholder
-- "token" and one event as the database owner, then switches to
-- authenticated / anon per person. It always ends with RAISE EXCEPTION: the
-- "error" message carries the results as JSON, and the abort rolls back every
-- row it created.
--
-- Expected:
--   flag "integration_google_calendar=false", old_tables_gone true, rows_before 0
--   admin_reads_token "denied…", admin_writes "denied…",
--   admin_status {"connected": true, "calendar_name": "Vabrato", "events": 1, "has_token": false}
--   agent_reads_events 1, agent_writes_event "denied…", agent_status_connected true
--   seller_events 0, seller_status "denied… staff_only"
--   anon_token "denied…", anon_events "denied…", anon_status "denied…"
--   second_row "denied… duplicate key"
do $$
declare
  admin uuid := 'a1000000-0000-4000-8000-0000000045a1';
  agent uuid := 'c1000000-0000-4000-8000-0000000045c1';
  seller uuid := 'e1000000-0000-4000-8000-0000000045e1';
  out jsonb := '{}';
  r text; n int; st record;
begin
  out := out || jsonb_build_object(
    'flag', (select string_agg(key || '=' || enabled, ',') from feature_flags where key = 'integration_google_calendar'),
    'old_tables_gone', to_regclass('public.calendar_events') is null and to_regclass('public.staff_calendar_prefs') is null,
    'rows_before', (select count(*) from team_calendar) + (select count(*) from team_calendar_events));
  insert into auth.users (id, email, instance_id, aud, role) values
    (admin, 'check-0045-admin@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent, 'check-0045-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0045-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin' where id = admin;
  update profiles set role = 'agent' where id = agent;
  update profiles set role = 'seller' where id = seller;
  insert into team_calendar (connected_by, account_email, scopes, token_ciphertext, calendar_id, calendar_name)
    values (admin, 'check-0045-admin@example.test', '{calendar.app.created}', 'v1.placeholder-ciphertext-not-a-token', 'check-cal', 'Vabrato');
  insert into team_calendar_events (source_key, google_event_id, content_hash)
    values ('appt:d1000000-0000-4000-8000-0000000045d1', 'check-evt', repeat('a', 64));
  begin insert into team_calendar (token_ciphertext) values ('v1.placeholder-ciphertext-second'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('second_row', r);

  -- The admin.
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  begin select count(*) into n from team_calendar; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_reads_token', r);
  begin update team_calendar set calendar_id = 'other'; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('admin_writes', r);
  select * into st from team_calendar_status();
  out := out || jsonb_build_object('admin_status', jsonb_build_object('connected', st.connected, 'calendar_name', st.calendar_name, 'events', st.events,
    'has_token', exists (select 1 from jsonb_object_keys(to_jsonb(st)) k where k = 'token_ciphertext')));
  reset role;

  -- An agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  select count(*) into n from team_calendar_events; out := out || jsonb_build_object('agent_reads_events', n);
  begin insert into team_calendar_events (source_key, google_event_id, content_hash) values ('deal:d1000000-0000-4000-8000-0000000045d1:coe', 'x', repeat('b', 64)); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_writes_event', r);
  select connected into st from team_calendar_status(); out := out || jsonb_build_object('agent_status_connected', st.connected);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from team_calendar_events; out := out || jsonb_build_object('seller_events', n);
  begin perform * from team_calendar_status(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_status', r);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from team_calendar; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_token', r);
  begin select count(*) into n from team_calendar_events; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_events', r);
  begin perform * from team_calendar_status(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_status', r);
  reset role;

  raise exception 'CHECK_0045 %', out;
end $$;
