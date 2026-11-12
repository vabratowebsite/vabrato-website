-- Repair items and responses check for the HOSTED project (0033). Run after
-- applying 0033: Supabase SQL editor, or the Supabase MCP execute_sql. No
-- model is called and nothing is sent.
--
-- It creates two fictional agents, a fictional seller and a fictional deal,
-- then switches to authenticated / anon per person. It always ends with
-- RAISE EXCEPTION: the "error" message carries the results as JSON, and the
-- abort rolls back every row it created.
--
-- Expected (2026-11-13):
--   flags "ai_staff_inspection_items=false,ai_staff_repair_response=false"
--   items_agent "allowed", response_agent "allowed", second_open_items "denied…" (one open list per report)
--   items_agent2 "denied…", items_seller "denied…", anon "denied"
--   no_deal "denied…", agent2_sees 0, seller_sees 0
--   approved_edit "denied: draft_closed", approved_discard "denied: draft_closed", used "print"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000033c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000033c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000033e1';
  deal uuid := 'd1000000-0000-4000-8000-0000000033d1';
  items jsonb := '{"document_id":"b1000000-0000-4000-8000-0000000033b1","items":[{"id":"i1","title":"Missing GFCI at kitchen outlets","trade":"electrical"}]}';
  resp uuid;
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_inspection_items', 'ai_staff_repair_response')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0033-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0033-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0033-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller' where id = seller;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by)
    values (deal, '1 Check Way, Belmont (fictional)', 'normal', '2026-10-01', 30, 0, agent, agent);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');

  -- The deal's agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, deal_id, subject, body, content) values ('inspection_items', deal, 'Repair items', '1 item', items); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('items_agent', r);
  begin insert into ai_drafts (kind, deal_id, subject, body, content) values ('inspection_items', deal, 'Repair items', '1 item', items); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('second_open_items', r);
  begin
    insert into ai_drafts (kind, deal_id, subject, body, content) values ('repair_response', deal, 'Response', 'Hello,', '{"decisions":[]}') returning id into resp;
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('response_agent', r);
  begin insert into ai_drafts (kind, subject, body, content) values ('repair_response', 'Response', 'Hello,', '{"decisions":[]}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('no_deal', r);
  reset role;

  update ai_drafts set status = 'approved' where id = resp;
  set local role authenticated;
  begin update ai_drafts set body = 'Hello, changed' where id = resp; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('approved_edit', r);
  begin update ai_drafts set status = 'discarded' where id = resp; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('approved_discard', r);
  update ai_drafts set sent_via = 'print' where id = resp;
  out := out || jsonb_build_object('used', (select sent_via from ai_drafts where id = resp));
  reset role;

  -- An agent without deal access.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where deal_id = deal; out := out || jsonb_build_object('agent2_sees', n);
  begin insert into ai_drafts (kind, deal_id, subject, body, content) values ('inspection_items', deal, 'x', 'x', '{"document_id":"other"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('items_agent2', r);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts; out := out || jsonb_build_object('seller_sees', n);
  begin insert into ai_drafts (kind, deal_id, subject, body, content) values ('inspection_items', deal, 'x', 'x', '{"document_id":"other"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('items_seller', r);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from ai_drafts; r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0033 %', out;
end $$;
