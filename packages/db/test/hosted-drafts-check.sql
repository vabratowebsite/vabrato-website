-- AI drafts check for the HOSTED project (0028). Run after applying 0028 or
-- changing the draft policies: Supabase SQL editor, or the Supabase MCP
-- execute_sql. No model is called and nothing is sent.
--
-- It creates two fictional agents, a VA and a seller, a lead, a deal and a
-- vendor, and switches to authenticated / anon per person. It always ends with
-- RAISE EXCEPTION: the "error" message carries the results as JSON, and the
-- abort rolls back every row it added. Needs at least one admin profile (made
-- the lead admin inside the check).
--
-- Expected (2026-11-12):
--   flags "ai_staff_escrow_update=false,ai_staff_lead_reply=false,ai_staff_open_house_followup=false,ai_staff_vendor_request=false"
--   agent_drafts_own_lead, va_drafts_own_deal, va_drafts_vendor "allowed"
--   agent2_drafts_others_lead, agent_drafts_others_deal, seller_drafts, anon_drafts "denied…"
--   admin_sees_unapproved 0, admin_sees_approved 1, seller_sees 0, agent2_sees 0
--   edit_after_approval "denied: draft_closed", sent_before_approval "denied: draft_not_approved"
--   purged 1 (an old discarded draft), approved_kept 1
--   anon/authenticated can't run purge_ai_drafts; cron_job "vabrato-purge-ai-drafts 41 11 * * *" (UTC)
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000028c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000028c2';
  va uuid := 'e1000000-0000-4000-8000-0000000028e1';
  seller uuid := 'f1000000-0000-4000-8000-0000000028f1';
  deal uuid := '00000000-0000-4000-8000-0000000028d1';
  vendor uuid := '00000000-0000-4000-8000-0000000028b1';
  admin_id uuid;
  lead uuid;
  d uuid; d2 uuid;
  out jsonb := '{}';
  r text; n int;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_lead_reply', 'ai_staff_open_house_followup', 'ai_staff_escrow_update', 'ai_staff_vendor_request')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0028-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0028-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (va, 'check-0028-va@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0028-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'va' where id = va;
  update profiles set role = 'seller' where id = seller;
  select id into admin_id from profiles where role = 'admin' limit 1;
  update app_settings set lead_admin_id = admin_id, lead_admin_away = false;
  insert into leads (kind, email, name, message) values ('contact', 'check-0028-lead@example.test', 'Jordan Example', 'Is it still available?') returning id into lead;
  update leads set assigned_to = agent where id = lead;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by)
    values (deal, '1 Fictional Way, San Carlos (check)', 'normal', '2026-03-02', 30, 0, va, va);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');
  insert into vendors (id, name, role) values (vendor, 'Check Termite Co (fictional)', 'Pest inspection');

  -- Who may draft for what.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, lead_id, subject, body) values ('lead_reply', lead, 'Re: your question', 'Hi Jordan') returning id into d; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_drafts_own_lead', r);
  begin insert into ai_drafts (kind, deal_id, body) values ('escrow_update', deal, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_drafts_others_deal', r);
  begin update ai_drafts set sent_via = 'email' where id = d; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('sent_before_approval', r);
  update ai_drafts set status = 'approved' where id = d;
  begin update ai_drafts set body = 'changed' where id = d; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('edit_after_approval', r);
  insert into ai_drafts (kind, lead_id, body) values ('lead_reply', lead, 'An unapproved draft') returning id into d2;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, lead_id, body) values ('lead_reply', lead, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_drafts_others_lead', r);
  select count(*) into n from ai_drafts where lead_id = lead; out := out || jsonb_build_object('agent2_sees', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', va, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', va::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, deal_id, body) values ('escrow_update', deal, 'Hi Dana'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('va_drafts_own_deal', r);
  begin insert into ai_drafts (kind, deal_id, vendor_id, body) values ('vendor_request', deal, vendor, 'Could you quote…'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('va_drafts_vendor', r);
  update ai_drafts set status = 'approved' where deal_id = deal and kind = 'escrow_update';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  select count(*) into n from ai_drafts where id = d2; out := out || jsonb_build_object('admin_sees_unapproved', n);
  select count(*) into n from ai_drafts where id = d; out := out || jsonb_build_object('admin_sees_approved', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, deal_id, body) values ('escrow_update', deal, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_drafts', r);
  select count(*) into n from ai_drafts; out := out || jsonb_build_object('seller_sees', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin insert into ai_drafts (kind, lead_id, body) values ('lead_reply', lead, 'x'); r := 'allowed'; exception when others then r := 'denied'; end;
  out := out || jsonb_build_object('anon_drafts', r);
  reset role;

  -- The 30-day purge: an old discarded draft goes, the approved one stays.
  update ai_drafts set status = 'discarded' where id = d2;
  alter table ai_drafts disable trigger ai_drafts_guard;
  update ai_drafts set discarded_at = now() - interval '31 days', updated_at = now() - interval '31 days' where id = d2;
  alter table ai_drafts enable trigger ai_drafts_guard;
  out := out || jsonb_build_object('purged', public.purge_ai_drafts(), 'approved_kept', (select count(*) from ai_drafts where id = d));
  out := out || jsonb_build_object(
    'anon_can_purge', has_function_privilege('anon', 'public.purge_ai_drafts()', 'execute'),
    'authenticated_can_purge', has_function_privilege('authenticated', 'public.purge_ai_drafts()', 'execute'));
  r := 'no pg_cron here';
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select coalesce(string_agg(jobname || ' ' || schedule, ','), 'none') from cron.job where jobname = 'vabrato-purge-ai-drafts'$q$ into r;
  end if;
  out := out || jsonb_build_object('cron_job', r);

  raise exception 'CHECK_0028 %', out;
end $$;
