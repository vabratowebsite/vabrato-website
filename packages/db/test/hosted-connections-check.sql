-- Connected accounts, for the HOSTED project (0042). Run after applying 0042:
-- Supabase SQL editor, or the Supabase MCP execute_sql. The per-person
-- calendar tables it also checked were replaced in 0045 by the team calendar
-- (hosted-team-calendar-check.sql), so they're no longer checked here.
-- Nothing is sent to Google and no real token is used.
--
-- It creates two fictional agents and a fictional seller, stores a
-- placeholder "token" as the database owner, then switches to authenticated
-- / anon per person. It always ends with RAISE EXCEPTION: the "error" message
-- carries the results as JSON, and the abort rolls back every row it created.
--
-- Expected:
--   flag "integration_google_calendar=false"
--   agent_reads_tokens "denied…", agent_adds_token "denied…", agent_my_connections 1,
--   agent_sees_token_column false, agent_flag "denied… admin_only"
--   agent2_my_connections 0
--   seller_my_connections 0
--   anon_tokens "denied…", anon_my_connections "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000042c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000042c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000042e1';
  out jsonb := '{}';
  r text; n int; b boolean;
begin
  out := out || jsonb_build_object('flag', (select string_agg(key || '=' || enabled, ',') from feature_flags where key = 'integration_google_calendar'));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0042-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0042-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0042-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller' where id = seller;
  insert into staff_connections (profile_id, provider, account_email, scopes, token_ciphertext)
    values (agent, 'google', 'check-0042-agent@example.test', '{calendar.events}', 'v1.placeholder-ciphertext-not-a-token');

  -- The connected agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin select count(*) into n from staff_connections; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_reads_tokens', r);
  begin insert into staff_connections (profile_id, provider, token_ciphertext) values (agent, 'dropbox', 'v1.placeholder-ciphertext-not-a-token'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_adds_token', r);
  select count(*) into n from my_connections(); out := out || jsonb_build_object('agent_my_connections', n);
  select exists (select 1 from jsonb_object_keys((select to_jsonb(c) from my_connections() c limit 1)) k where k = 'token_ciphertext') into b;
  out := out || jsonb_build_object('agent_sees_token_column', b);
  begin perform set_integration_flag('integration_google_calendar', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_flag', r);
  reset role;

  -- Another agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from my_connections(); out := out || jsonb_build_object('agent2_my_connections', n);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from my_connections(); out := out || jsonb_build_object('seller_my_connections', n);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from staff_connections; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_tokens', r);
  begin select count(*) into n from my_connections(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon_my_connections', r);
  reset role;

  raise exception 'CHECK_0042 %', out;
end $$;
