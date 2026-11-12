-- Deal documents check for the HOSTED project (0032). Run after applying
-- 0032: Supabase SQL editor, or the Supabase MCP execute_sql. No model is
-- called, no file is uploaded (storage rows only) and nothing is sent.
--
-- It creates two fictional agents, a fictional seller with one upload, and a
-- fictional deal, then switches to authenticated / anon per person. It always
-- ends with RAISE EXCEPTION: the "error" message carries the results as JSON,
-- and the abort rolls back every row it created.
--
-- Expected (2026-11-12):
--   flags "ai_staff_document_check=false,ai_staff_receipt_reader=false"
--   agent_adds "allowed", agent_sees 1, shared_in_staff_folder "denied…"
--   agent2_sees 0, agent2_adds "denied…", seller_sees_rows 0, anon "denied"
--   seller_storage "deal/…/shared.pdf" only (not staff/, Staff/, tmp/ or deeper), agent_storage 5, agent2_storage 0
--   odd_path "denied…" (the table takes only deal/{id}/x or deal/{id}/staff/x)
--   audit_agent "allowed", audit_agent2 "denied…", audit_bad_action "denied…"
--   tag_seller_upload "allowed", seller_tags "denied…"
--   mark "allowed", agent2_marks 0
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000032c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000032c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000032e1';
  deal uuid := 'd1000000-0000-4000-8000-0000000032d1';
  mdoc uuid := 'b1000000-0000-4000-8000-0000000032b1';
  out jsonb := '{}';
  r text; n int; names text;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_document_check', 'ai_staff_receipt_reader')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0032-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0032-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0032-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller', agent_id = agent where id = seller;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by)
    values (deal, '1 Check Way, Belmont (fictional)', 'trust', '2026-10-01', 30, 0, agent, agent);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');
  insert into member_documents (id, profile_id, name, storage_path, size_bytes, content_type, uploaded_by)
    values (mdoc, seller, 'spq.pdf', 'member/' || seller || '/spq.pdf', 10, 'application/pdf', seller);
  insert into storage.objects (bucket_id, name) values
    ('deal-docs', 'deal/' || deal || '/shared.pdf'),
    ('deal-docs', 'deal/' || deal || '/staff/private.pdf'),
    ('deal-docs', 'deal/' || deal || '/tmp/x.pdf'),
    ('deal-docs', 'deal/' || deal || '/Staff/x.pdf'),
    ('deal-docs', 'deal/' || deal || '/a/b/c.pdf');

  -- The deal's agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin
    insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types)
      values (deal, 'deal/' || deal || '/staff/a-rpa.pdf', 'rpa.pdf', 10, 'application/pdf', '{rpa}');
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_adds', r);
  select count(*) into n from deal_documents where deal_id = deal; out := out || jsonb_build_object('agent_sees', n);
  begin
    insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, shared)
      values (deal, 'deal/' || deal || '/staff/b.pdf', 'b.pdf', 10, 'application/pdf', true);
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('shared_in_staff_folder', r);
  select count(*) into n from storage.objects where bucket_id = 'deal-docs' and name like 'deal/' || deal || '/%'; out := out || jsonb_build_object('agent_storage', n);
  begin
    insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, shared)
      values (deal, 'deal/' || deal || '/tmp/x.pdf', 'x.pdf', 10, 'application/pdf', true);
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('odd_path', r);
  begin perform public.log_deal_document_action(deal, 'document_shared', mdoc, 'rpa.pdf'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('audit_agent', r);
  begin perform public.log_deal_document_action(deal, 'document_viewed', mdoc, 'rpa.pdf'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('audit_bad_action', r);
  begin insert into deal_member_document_types (deal_id, member_document_id, doc_types) values (deal, mdoc, '{spq}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('tag_seller_upload', r);
  begin insert into deal_checklist_marks (deal_id, item_key, note) values (deal, 'lead_paint', 'Built after 1978'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('mark', r);
  reset role;

  -- Another agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from deal_documents where deal_id = deal; out := out || jsonb_build_object('agent2_sees', n);
  begin
    insert into deal_documents (deal_id, path, file_name, size_bytes, content_type)
      values (deal, 'deal/' || deal || '/staff/c.pdf', 'c.pdf', 10, 'application/pdf');
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_adds', r);
  select count(*) into n from storage.objects where bucket_id = 'deal-docs' and name like 'deal/' || deal || '/%'; out := out || jsonb_build_object('agent2_storage', n);
  select count(*) into n from deal_checklist_marks where deal_id = deal; out := out || jsonb_build_object('agent2_marks', n);
  begin perform public.log_deal_document_action(deal, 'document_shared', mdoc, 'rpa.pdf'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('audit_agent2', r);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from deal_documents; out := out || jsonb_build_object('seller_sees_rows', n);
  select string_agg(name, ',' order by name) into names from storage.objects where bucket_id = 'deal-docs' and name like 'deal/' || deal || '/%';
  out := out || jsonb_build_object('seller_storage', names);
  begin insert into deal_member_document_types (deal_id, member_document_id, doc_types) values (deal, mdoc, '{avid}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_tags', r);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from deal_documents; r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0032 %', out;
end $$;
