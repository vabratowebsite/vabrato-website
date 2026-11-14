-- MLS AI approval gate for the HOSTED project (0039). Run after applying 0039:
-- Supabase SQL editor, or the Supabase MCP execute_sql. No model is called.
--
-- It creates a fictional admin and a buyer, then tries the switches as each.
-- It always ends with RAISE EXCEPTION: the "error" message carries the
-- results as JSON, and the abort rolls back every change it made.
--
-- Expected:
--   flags "ai_member_compare=false,ai_member_listing=false,ai_mls_approved=false"
--   compare_before_approval "denied: mls_ai_not_approved", listing_before_approval "denied: mls_ai_not_approved"
--   direct_sql_before_approval "denied: mls_ai_not_approved"
--   buyer_sets_gate "denied: admin_only"
--   after_approval "ai_member_compare=true,ai_member_listing=true,ai_mls_approved=true"
--   after_gate_off "ai_member_compare=false,ai_member_listing=false,ai_mls_approved=false"
--   audit 4
do $$
declare
  admin uuid := 'a1000000-0000-4000-8000-0000000039a1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000039f1';
  out jsonb := '{}';
  r text;
  keys text[] := array['ai_mls_approved', 'ai_member_compare', 'ai_member_listing'];
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key = any(keys)));
  insert into auth.users (id, email, instance_id, aud, role) values
    (admin, 'check-0039-admin@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0039-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin' where id = admin;
  update profiles set role = 'buyer' where id = buyer;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  begin perform public.set_ai_flag('ai_member_compare', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('compare_before_approval', r);
  begin perform public.set_ai_flag('ai_member_listing', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('listing_before_approval', r);
  reset role;
  begin update feature_flags set enabled = true where key = 'ai_member_compare'; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('direct_sql_before_approval', r);

  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin perform public.set_ai_flag('ai_mls_approved', true); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_sets_gate', r);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  perform public.set_ai_flag('ai_mls_approved', true);
  perform public.set_ai_flag('ai_member_compare', true);
  perform public.set_ai_flag('ai_member_listing', true);
  reset role;
  out := out || jsonb_build_object('after_approval', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key = any(keys)));
  set local role authenticated;
  perform public.set_ai_flag('ai_mls_approved', false);
  reset role;
  out := out || jsonb_build_object('after_gate_off', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key = any(keys)));
  out := out || jsonb_build_object('audit', (select count(*) from staff_audit where actor_id = admin and action = 'set_ai_flag'));

  raise exception 'CHECK_0039 %', out;
end $$;
