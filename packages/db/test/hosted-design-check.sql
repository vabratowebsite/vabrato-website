-- Design for the HOSTED project (0041). Run after applying 0041: Supabase
-- SQL editor, or the Supabase MCP execute_sql. No model is called.
--
-- It creates a fictional agent, two sellers (one assigned to the agent), a
-- buyer and two fictional listings (one ours). It always ends with RAISE
-- EXCEPTION: the "error" message carries the results as JSON, and the abort
-- rolls back every change it made.
--
-- Expected:
--   flags "ai_member_flyer=false,ai_member_palette=false,ai_member_staging=false"
--   seller_sends "allowed", status "pending", alert 1
--   buyer_sends "denied…", seller_for_other "denied…", seller_sends_approved "denied…"
--   seller2_sees 0, agent_sees 2, seller_updates "denied…"
--   approve_other_listing "denied: not_our_listing", approve_other_open_house "denied: not_this_open_house"
--   approved "approved|QA-0041-OWN|QA-0041-OH", decide_again "denied: not_found", seller_decides "denied: staff_only"
--   seller_deletes_approved 1 (still there), deleted_my_data 2
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000041c1';
  seller uuid := 'e1000000-0000-4000-8000-0000000041e1';
  seller2 uuid := 'e2000000-0000-4000-8000-0000000041e2';
  buyer uuid := 'f1000000-0000-4000-8000-0000000041f1';
  out jsonb := '{}';
  r text; n int; a uuid; b uuid;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_member_palette', 'ai_member_staging', 'ai_member_flyer')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0041-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0041-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller2, 'check-0041-seller2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0041-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id = agent;
  update profiles set role = 'seller', agent_id = agent where id = seller;
  update profiles set role = 'seller' where id = seller2;
  update profiles set role = 'buyer' where id = buyer;
  insert into mls_listings (listing_key, standard_status, is_own_listing, modification_ts, data) values
    ('QA-0041-OWN', 'Active', true, now(), '{}'), ('QA-0041-OTHER', 'Active', false, now(), '{}');
  insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time) values
    ('QA-0041-OH', 'QA-0041-OWN', current_date + 3, now() + interval '3 days', now() + interval '3 days 2 hours'),
    ('QA-0041-OH-OTHER', 'QA-0041-OTHER', current_date + 3, now() + interval '3 days', now() + interval '3 days 2 hours');

  -- The seller sends a flyer; the buyer and the wrong rows are refused.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  begin insert into member_promos (kind, headline, highlights) values ('open_house', 'Open house Sunday', 'Big yard') returning id into a; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_sends', r);
  begin insert into member_promos (profile_id, kind, headline) values (seller2, 'open_house', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_for_other', r);
  begin insert into member_promos (kind, headline, status) values ('open_house', 'x', 'approved'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_sends_approved', r);
  begin update member_promos set headline = 'changed' where id = a; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_updates', r);
  begin perform public.decide_member_promo(a, true, 'QA-0041-OWN'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_decides', r);
  insert into member_promos (kind, headline) values ('just_listed', 'Just listed') returning id into b;
  reset role;
  out := out || jsonb_build_object('status', (select status from member_promos where id = a));
  out := out || jsonb_build_object('alert', (select count(*) from staff_notifications where recipient_id = agent and kind = 'member_promo'));

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin insert into member_promos (kind, headline) values ('open_house', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_sends', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', seller2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller2::text, true);
  set local role authenticated;
  select count(*) into n from member_promos; out := out || jsonb_build_object('seller2_sees', n);
  reset role;

  -- The agent decides.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  select count(*) into n from member_promos where profile_id = seller; out := out || jsonb_build_object('agent_sees', n);
  begin perform public.decide_member_promo(a, true, 'QA-0041-OTHER'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('approve_other_listing', r);
  begin perform public.decide_member_promo(a, true, 'QA-0041-OWN', 'QA-0041-OH-OTHER'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('approve_other_open_house', r);
  perform public.decide_member_promo(a, true, 'QA-0041-OWN', 'QA-0041-OH');
  begin perform public.decide_member_promo(a, false); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('decide_again', r);
  reset role;
  out := out || jsonb_build_object('approved', (select status || '|' || listing_key || '|' || open_house_key from member_promos where id = a));

  -- The seller can't delete the approved one, but "Delete my assistant data" removes both.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  delete from member_promos where id = a;
  select count(*) into n from member_promos where id = a; out := out || jsonb_build_object('seller_deletes_approved', n);
  out := out || jsonb_build_object('deleted_my_data', public.delete_my_assistant_data());
  reset role;

  raise exception 'CHECK_0041 %', out;
end $$;
