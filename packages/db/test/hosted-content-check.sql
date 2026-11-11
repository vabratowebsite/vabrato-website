-- Content, agent photos and featured listings check for the HOSTED project
-- (0024). PGlite only stubs Supabase Storage, so run this after any change to
-- the content functions, the agent-photos policies or featured_listings:
-- Supabase SQL editor, or the Supabase MCP execute_sql.
--
-- It creates a fictional cast (a lead admin, an agent, a buyer), switches to
-- anon / authenticated per person, and always ends with RAISE EXCEPTION: the
-- "error" message carries the results as JSON, and the abort rolls back every
-- row it created (including the temporary lead admin setting).
--
-- Expected (2026-11-11, preview fixtures FX-001 Active, FX-005 Closed):
--   agent_publish "denied: lead_admin_only", lead_admin_publish "allowed"
--   agent_direct_post_update / admin_direct_post_update "denied"
--   agent_upload_own_folder "allowed", agent_upload_other_folder "denied"
--   buyer_upload_own_folder "denied", buyer_draft "denied", buyer_sees_revisions 0
--   anon_draft "denied", anon_lists_photos 0, anon_sees_published_post 1
--   anon_sees_pins and anon_listing_cards: the Active key only
do $$
declare
  mark  uuid := 'a1000000-0000-4000-8000-0000000024a1';
  agent uuid := 'c1000000-0000-4000-8000-0000000024c1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000024f1';
  active_key text; sold_key text;
  out jsonb := '{}';
  rev uuid; n int; r text;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (mark,  'check-0024-mark@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent, 'check-0024-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0024-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = mark;
  update public.profiles set role = 'agent' where id = agent;
  update public.profiles set role = 'buyer' where id = buyer;
  update public.app_settings set lead_admin_id = mark, lead_admin_away = false;
  select listing_key into active_key from mls_listings where standard_status = 'Active' limit 1;
  select listing_key into sold_key from mls_listings where standard_status = 'Closed' limit 1;
  out := out || jsonb_build_object('fixture_active', active_key is not null, 'fixture_sold', sold_key is not null);

  -- Agent drafts and submits a post.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  rev := public.save_content_draft(null, 'posts', 'check-0024-post', '{"kind":"insight","title":"Check","excerpt":"","body_md":"Fictional."}');
  perform public.submit_content(rev);
  begin perform public.publish_content(rev); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_publish', r);
  begin update posts set title = 'x' where slug = 'placeholder-insight'; r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('agent_direct_post_update', r);
  begin insert into storage.objects (bucket_id, name) values ('agent-photos', agent || '/check.jpg'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('agent_upload_own_folder', r);
  begin insert into storage.objects (bucket_id, name) values ('agent-photos', mark || '/check.jpg'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('agent_upload_other_folder', r);
  if active_key is not null then
    begin insert into featured_listings (listing_key, sort) values (active_key, 1); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
    out := out || jsonb_build_object('agent_pin_active', r);
  end if;
  reset role;
  -- A pin on a sold listing (added directly) must stay hidden from the public.
  if sold_key is not null then insert into featured_listings (listing_key, sort, created_by) values (sold_key, 2, agent); end if;

  -- Mark (role admin) can't write directly either, but publishes.
  perform set_config('request.jwt.claims', json_build_object('sub', mark, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', mark::text, true);
  set local role authenticated;
  begin update posts set title = 'x' where slug = 'placeholder-insight'; r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('admin_direct_post_update', r);
  begin perform public.publish_content(rev); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('lead_admin_publish', r);
  reset role;

  -- Buyer and anon.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin insert into storage.objects (bucket_id, name) values ('agent-photos', buyer || '/check.jpg'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('buyer_upload_own_folder', r);
  begin perform public.save_content_draft(null, 'posts', 'check-0024-b', '{"kind":"insight","title":"B","body_md":"B"}'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('buyer_draft', r);
  select count(*) into n from content_revisions; out := out || jsonb_build_object('buyer_sees_revisions', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into n from posts where slug = 'check-0024-post'; out := out || jsonb_build_object('anon_sees_published_post', n);
  select string_agg(listing_key, ',') into r from featured_listings; out := out || jsonb_build_object('anon_sees_pins', coalesce(r, ''));
  select string_agg(listing_key, ',') into r from listing_cards(array[active_key, sold_key]); out := out || jsonb_build_object('anon_listing_cards', coalesce(r, ''));
  select count(*) into n from storage.objects where bucket_id = 'agent-photos'; out := out || jsonb_build_object('anon_lists_photos', n);
  begin perform public.save_content_draft(null, 'posts', 'check-0024-c', '{}'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_draft', r);
  reset role;

  out := out || jsonb_build_object('active_key', active_key, 'sold_key', sold_key);
  -- Abort on purpose so every row above is rolled back.
  raise exception 'CHECK_0024 %', out;
end $$;
