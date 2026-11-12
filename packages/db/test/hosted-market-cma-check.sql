-- Market updates and CMA write-ups check for the HOSTED project (0031). Run
-- after applying 0031: Supabase SQL editor, or the Supabase MCP execute_sql.
-- No model is called and nothing is sent.
--
-- It creates two fictional agents, a buyer and a fictional CMA, turns the
-- sold-data switches on inside the check (they're off on hosted), and switches
-- to authenticated / anon per person. It always ends with RAISE EXCEPTION:
-- the "error" message carries the results as JSON, and the abort rolls back
-- every row and switch it changed.
--
-- Expected (2026-11-12):
--   flags "ai_staff_cma_writeup=false,ai_staff_market_update=false"
--   market_while_stats_off "denied…", writeup_while_cmas_off "denied…"
--   market_on, writeup_own_cma "allowed"; writeup_other_cma "denied…"
--   member_market "denied…", anon_market "denied"
--   website_before_approval "denied: draft_not_approved", website_after "website"
--   agent2_sees 0
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000031c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000031c2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000031f1';
  cma uuid := '00000000-0000-4000-8000-0000000031b1';
  cma2 uuid := '00000000-0000-4000-8000-0000000031b2';
  m uuid;
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_market_update', 'ai_staff_cma_writeup')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0031-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0031-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0031-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'buyer' where id = buyer;
  insert into cmas (id, created_by, title) values (cma, agent, 'Check CMA (fictional)'), (cma2, agent2, 'Check CMA two (fictional)');
  update feature_flags set enabled = false where key in ('market_stats_enabled', 'cma_enabled');

  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, body, content) values ('market_update', 'Update', '{"title":"x"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('market_while_stats_off', r);
  begin insert into ai_drafts (kind, cma_id, body, content) values ('cma_writeup', cma, 'Summary', '{"summary":"x"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('writeup_while_cmas_off', r);
  reset role;

  update feature_flags set enabled = true where key in ('market_stats_enabled', 'cma_enabled');
  set local role authenticated;
  begin insert into ai_drafts (kind, body, content) values ('market_update', 'Update', '{"title":"x"}') returning id into m; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('market_on', r);
  begin insert into ai_drafts (kind, cma_id, body, content) values ('cma_writeup', cma, 'Summary', '{"summary":"x"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('writeup_own_cma', r);
  begin insert into ai_drafts (kind, cma_id, body, content) values ('cma_writeup', cma2, 'Summary', '{"summary":"x"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('writeup_other_cma', r);
  begin update ai_drafts set sent_via = 'website' where id = m; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('website_before_approval', r);
  reset role;

  update ai_drafts set status = 'approved' where id = m;
  set local role authenticated;
  update ai_drafts set sent_via = 'website' where id = m;
  out := out || jsonb_build_object('website_after', (select sent_via from ai_drafts where id = m));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where owner_id = agent; out := out || jsonb_build_object('agent2_sees', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, body, content) values ('market_update', 'x', '{}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('member_market', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin insert into ai_drafts (kind, body, content) values ('market_update', 'x', '{}'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_market', r);
  reset role;

  raise exception 'CHECK_0031 %', out;
end $$;
