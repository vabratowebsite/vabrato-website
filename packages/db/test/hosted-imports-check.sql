-- File imports from Google Drive and Dropbox, for the HOSTED project (0043).
-- Run after applying 0043: Supabase SQL editor, or the Supabase MCP
-- execute_sql. Nothing is fetched from Google or Dropbox.
--
-- It creates two fictional agents, a fictional seller and two deals, then
-- switches to authenticated / anon per person. It always ends with RAISE
-- EXCEPTION: the "error" message carries the results as JSON, and the abort
-- rolls back every row it created.
--
-- Expected:
--   flags "integration_dropbox=false,integration_google_drive=false"
--   doc_drive "allowed", doc_again "denied… duplicate key", doc_other_deal "allowed", doc_bad_ref "denied… check"
--   receipt_drive "allowed", receipt_mismatch "denied… check", receipt_no_ref "denied… check", receipt_again "denied… duplicate key"
--   agent2_doc "denied… row-level security", seller_docs 0, seller_receipts 0, anon "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000043c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000043c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000043e1';
  deal uuid := 'd1000000-0000-4000-8000-0000000043d1';
  deal2 uuid := 'd2000000-0000-4000-8000-0000000043d2';
  ref text := 'drive:1AbCdEfGhIjKlMnOp_qR-st';
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('integration_google_drive', 'integration_dropbox')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0043-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0043-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0043-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller' where id = seller;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values
    (deal, '1 Check Way, Belmont (fictional)', 'normal', '2026-10-01', 30, 0, agent, agent),
    (deal2, '2 Check Way, Belmont (fictional)', 'normal', '2026-10-01', 30, 0, agent, agent);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');

  -- The deal's agent.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values (deal, 'deal/' || deal || '/staff/check-a.pdf', 'a.pdf', 10, 'application/pdf', agent, ref); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('doc_drive', r);
  begin insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values (deal, 'deal/' || deal || '/staff/check-b.pdf', 'b.pdf', 10, 'application/pdf', agent, ref); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('doc_again', r);
  begin insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values (deal2, 'deal/' || deal2 || '/staff/check-a.pdf', 'a.pdf', 10, 'application/pdf', agent, ref); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('doc_other_deal', r);
  begin insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values (deal, 'deal/' || deal || '/staff/check-c.pdf', 'c.pdf', 10, 'application/pdf', agent, 'https://drive.google.com/x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('doc_bad_ref', r);
  begin insert into receipts (deal_id, vendor, receipt_date, amount, source, external_ref) values (deal, 'Check Cleaners', '2026-11-10', 120, 'drive', ref); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('receipt_drive', r);
  begin insert into receipts (deal_id, vendor, receipt_date, amount, source, external_ref) values (deal, 'Check Cleaners', '2026-11-10', 120, 'dropbox', 'drive:2AbCdEfGhIjKl'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('receipt_mismatch', r);
  begin insert into receipts (deal_id, vendor, receipt_date, amount, source) values (deal, 'Check Cleaners', '2026-11-10', 120, 'drive'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('receipt_no_ref', r);
  begin insert into receipts (deal_id, vendor, receipt_date, amount, source, external_ref) values (deal, 'Check Cleaners', '2026-11-10', 120, 'drive', ref); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('receipt_again', r);
  reset role;

  -- An agent who doesn't work the deal.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  begin insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, uploaded_by, external_ref) values (deal, 'deal/' || deal || '/staff/check-d.pdf', 'd.pdf', 10, 'application/pdf', agent2, 'drive:3AbCdEfGhIjKl'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_doc', r);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from deal_documents; out := out || jsonb_build_object('seller_docs', n);
  select count(*) into n from receipts; out := out || jsonb_build_object('seller_receipts', n);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from deal_documents; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0043 %', out;
end $$;
