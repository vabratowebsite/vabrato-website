-- Document checks and the counter-offer switch, for the HOSTED project
-- (0034). Run after applying 0034: Supabase SQL editor, or the Supabase MCP
-- execute_sql. No model is called and nothing is sent.
--
-- It creates two fictional agents, a fictional seller, a deal, one staff file
-- and one seller upload, then switches to authenticated / anon per person. It
-- always ends with RAISE EXCEPTION: the "error" message carries the results
-- as JSON, and the abort rolls back every row it created.
--
-- Expected:
--   flag "ai_staff_counter_changes=false"
--   new_file "unchecked", agent_check "by_agent:no:2", backdated false
--   set_checked_by "denied…", cleared "denied: check_incomplete", half "denied: check_incomplete"
--   member_check "by_agent:unclear:1"
--   agent2_update 0, seller_update 0, agent2_sees 0, anon "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000034c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000034c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000034e1';
  deal uuid := 'd1000000-0000-4000-8000-0000000034d1';
  doc uuid := 'b1000000-0000-4000-8000-0000000034b1';
  mdoc uuid := 'b2000000-0000-4000-8000-0000000034b2';
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flag', (select key || '=' || enabled from feature_flags where key = 'ai_staff_counter_changes'));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0034-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0034-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0034-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller' where id = seller;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by)
    values (deal, '1 Check Way, Belmont (fictional)', 'normal', '2026-10-01', 30, 0, agent, agent);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');
  insert into deal_documents (id, deal_id, path, file_name, size_bytes, content_type, uploaded_by)
    values (doc, deal, 'deal/' || deal || '/staff/check-0034.pdf', 'Counter offer 1.pdf', 10, 'application/pdf', agent);
  insert into member_documents (id, profile_id, name, storage_path, size_bytes, content_type, uploaded_by)
    values (mdoc, seller, 'addendum.pdf', 'member/' || seller || '/check-0034.pdf', 10, 'application/pdf', seller);
  out := out || jsonb_build_object('new_file', (select case when checked_at is null then 'unchecked' else 'checked' end from deal_documents where id = doc));

  -- The deal's agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  update deal_documents set check_signed = 'no', check_issue_count = 2, checked_at = '2001-01-01' where id = doc;
  select case when checked_by = agent then 'by_agent' else 'by_other' end || ':' || check_signed || ':' || check_issue_count into r from deal_documents where id = doc;
  out := out || jsonb_build_object('agent_check', r);
  out := out || jsonb_build_object('backdated', (select checked_at < now() - interval '1 day' from deal_documents where id = doc));
  begin update deal_documents set checked_by = agent2 where id = doc; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('set_checked_by', r);
  begin update deal_documents set check_signed = null, check_issue_count = null where id = doc; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('cleared', r);
  begin insert into deal_member_document_types (deal_id, member_document_id, check_signed) values (deal, mdoc, 'yes'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('half', r);
  insert into deal_member_document_types (deal_id, member_document_id, check_signed, check_issue_count) values (deal, mdoc, 'unclear', 1);
  out := out || jsonb_build_object('member_check', (select case when checked_by = agent then 'by_agent' else 'by_other' end || ':' || check_signed || ':' || check_issue_count from deal_member_document_types where member_document_id = mdoc));
  reset role;

  -- An agent without deal access.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = doc;
  get diagnostics n = row_count; out := out || jsonb_build_object('agent2_update', n);
  select count(*) into n from deal_documents where id = doc; out := out || jsonb_build_object('agent2_sees', n);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = doc;
  get diagnostics n = row_count; out := out || jsonb_build_object('seller_update', n);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin update deal_documents set check_signed = 'yes', check_issue_count = 0 where id = doc; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0034 %', out;
end $$;
