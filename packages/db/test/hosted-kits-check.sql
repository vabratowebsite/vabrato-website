-- Launch kits and presentations check for the HOSTED project (0030). Run after
-- applying 0030: Supabase SQL editor, or the Supabase MCP execute_sql. No
-- model is called and nothing is sent.
--
-- It creates two fictional agents, a buyer and two fictional listings (one
-- ours, one not), and switches to authenticated / anon per person. It always
-- ends with RAISE EXCEPTION: the "error" message carries the results as JSON,
-- and the abort rolls back every row it added. Needs at least one admin.
--
-- Expected, and seen on hosted (2026-11-12):
--   flags "ai_staff_listing_kit=false,ai_staff_presentations=false"
--   kit_own "allowed", kit_other "denied…row-level security", presentation "allowed"
--   buyer_presentation_by_member "denied…", anon_kit "denied"
--   agent2_sees 0, admin_sees_draft 0, admin_sees_approved 1
--   print_before_approval "denied: draft_not_approved", edit_after_approval "denied: draft_closed"
--   email_draft_without_lead "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000030c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000030c2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000030f1';
  admin_id uuid;
  k uuid;
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_listing_kit', 'ai_staff_presentations')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0030-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0030-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0030-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'buyer' where id = buyer;
  select id into admin_id from profiles where role = 'admin' limit 1;
  insert into mls_listings (listing_key, standard_status, is_own_listing, modification_ts, source) values
    ('CHECK-0030-OWN', 'Active', true, now(), 'mock'), ('CHECK-0030-OTHER', 'Active', false, now(), 'mock');

  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, listing_key, body, content) values ('listing_kit', 'CHECK-0030-OWN', 'Kit', '{"headline":"Fictional"}') returning id into k; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('kit_own', r);
  begin insert into ai_drafts (kind, listing_key, body, content) values ('listing_kit', 'CHECK-0030-OTHER', 'Kit', '{}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('kit_other', r);
  begin insert into ai_drafts (kind, body, content) values ('listing_presentation', 'Intro', '{"title":"Fictional"}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('presentation', r);
  begin insert into ai_drafts (kind, body) values ('lead_reply', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('email_draft_without_lead', r);
  begin update ai_drafts set sent_via = 'print' where id = k; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('print_before_approval', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where id = k; out := out || jsonb_build_object('admin_sees_draft', n);
  reset role;

  update ai_drafts set status = 'approved' where id = k;
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin update ai_drafts set content = '{"headline":"changed"}' where id = k; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('edit_after_approval', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where id = k; out := out || jsonb_build_object('admin_sees_approved', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where id = k; out := out || jsonb_build_object('agent2_sees', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, body, content) values ('buyer_presentation', 'x', '{}'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_presentation_by_member', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin insert into ai_drafts (kind, listing_key, body, content) values ('listing_kit', 'CHECK-0030-OWN', 'x', '{}'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_kit', r);
  reset role;

  raise exception 'CHECK_0030 %', out;
end $$;
