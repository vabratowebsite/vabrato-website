-- Storage isolation check for the HOSTED project (SEC-2). PGlite only copies
-- the storage.objects policies from 0009/0013, so run this after any storage
-- policy change: Supabase SQL editor, or the Supabase MCP execute_sql.
--
-- It creates a fictional cast, switches to anon / authenticated per person,
-- and always ends with RAISE EXCEPTION: the "error" message carries the
-- results as JSON, and the abort rolls back every row it created.
--
-- Expected (2026-11-10):
--   anon     0 deal-docs, 0 receipts, uploads denied
--   sellerA  1 deal-docs (own deal), 0 receipts, uploads denied
--   agentA   1 deal-docs, 1 receipts, uploads to deal A allowed
--   agentB   1 deal-docs, 1 receipts (deal B only), uploads to deal A denied
--   buyerA   0, 0, uploads denied
--   everyone 0 mls-photos listable, mls-photos uploads denied
do $$
declare
  seller_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  agent_a  uuid := 'a1000000-0000-4000-8000-00000000000a';
  agent_b  uuid := 'b1000000-0000-4000-8000-00000000000b';
  buyer_a  uuid := 'a2000000-0000-4000-8000-00000000000a';
  deal_a   uuid := 'da000000-0000-4000-8000-0000000000da';
  deal_b   uuid := 'db000000-0000-4000-8000-0000000000db';
  who record;
  out jsonb := '[]';
  docs int; recs int; photos int; ins_doc text; ins_rec text; ins_photo text;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (seller_a, 'iso-seller-a@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent_a,  'iso-agent-a@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent_b,  'iso-agent-b@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer_a,  'iso-buyer-a@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set role = 'seller' where id = seller_a;
  update public.profiles set role = 'agent' where id in (agent_a, agent_b);
  insert into public.deals (id, address, ratification_date, agent_id, created_by) values
    (deal_a, '100 Example Way (isolation check)', '2026-10-01', agent_a, agent_a),
    (deal_b, '200 Sample Ct (isolation check)', '2026-10-02', agent_b, agent_b);
  insert into public.deal_members (deal_id, profile_id, member_role) values (deal_a, seller_a, 'seller');
  insert into storage.objects (bucket_id, name) values
    ('deal-docs', 'deal/' || deal_a || '/check.pdf'),
    ('deal-docs', 'deal/' || deal_b || '/check.pdf'),
    ('receipts',  'deal/' || deal_a || '/check.pdf'),
    ('receipts',  'deal/' || deal_b || '/check.pdf'),
    ('mls-photos', 'listing/ISO-CHECK/photo.svg');

  for who in
    select * from (values
      ('anon', 'anon', null::uuid),
      ('sellerA', 'authenticated', seller_a),
      ('agentA', 'authenticated', agent_a),
      ('agentB', 'authenticated', agent_b),
      ('buyerA', 'authenticated', buyer_a)
    ) as v(label, api_role, uid)
  loop
    perform set_config('request.jwt.claims', coalesce(json_build_object('sub', who.uid, 'role', who.api_role)::text, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(who.uid::text, ''), true);
    execute format('set local role %I', who.api_role);

    select count(*) into docs from storage.objects where bucket_id = 'deal-docs';
    select count(*) into recs from storage.objects where bucket_id = 'receipts';
    select count(*) into photos from storage.objects where bucket_id = 'mls-photos';

    begin
      insert into storage.objects (bucket_id, name) values ('deal-docs', 'deal/' || deal_a || '/upload-' || who.label || '.pdf');
      ins_doc := 'allowed';
    exception when others then ins_doc := 'denied';
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('receipts', 'deal/' || deal_a || '/upload-' || who.label || '.pdf');
      ins_rec := 'allowed';
    exception when others then ins_rec := 'denied';
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('mls-photos', 'listing/ISO-CHECK/' || who.label || '.svg');
      ins_photo := 'allowed';
    exception when others then ins_photo := 'denied';
    end;

    execute 'reset role';
    out := out || jsonb_build_object('who', who.label, 'deal_docs_visible', docs, 'receipts_visible', recs,
      'mls_photos_listable', photos, 'upload_deal_docs_A', ins_doc, 'upload_receipts_A', ins_rec, 'upload_mls_photos', ins_photo);
  end loop;

  -- Abort on purpose so every row above is rolled back.
  raise exception 'ISOLATION_RESULT %', out;
end $$;
