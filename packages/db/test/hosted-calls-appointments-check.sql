-- Call follow-ups, appointment drafts and staff to-dos, for the HOSTED
-- project (0035). Run after applying 0035: Supabase SQL editor, or the
-- Supabase MCP execute_sql. No model is called and nothing is sent.
--
-- It creates two fictional agents, a fictional seller, a lead and a deal,
-- then switches to authenticated / anon per person. It always ends with
-- RAISE EXCEPTION: the "error" message carries the results as JSON, and the
-- abort rolls back every row it created.
--
-- Expected:
--   flags "ai_staff_appointments=false,ai_staff_call_notes=false"
--   followup_lead "allowed", appointment_deal "allowed", both_targets "denied…", appointment_no_content "denied…"
--   todo_deal "allowed", todo_lead "allowed", todo_other_name "denied…", agent_sees 2, done "1"
--   agent2_sees 0, agent2_todo "denied…", agent2_drafts "denied…"
--   seller_sees 0, seller_tasks_has_todo 0, anon "denied…"
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000035c1';
  agent2 uuid := 'c2000000-0000-4000-8000-0000000035c2';
  seller uuid := 'e1000000-0000-4000-8000-0000000035e1';
  deal uuid := 'd1000000-0000-4000-8000-0000000035d1';
  lead uuid;
  appt jsonb := '{"title":"Final walkthrough","date":"2026-11-17","start":"15:00","minutes":45,"location":"1 Check Way, Belmont","with":"Dana"}';
  out jsonb := '{}';
  r text; n int; todo uuid;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_call_notes', 'ai_staff_appointments')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0035-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (agent2, 'check-0035-agent2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0035-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id in (agent, agent2);
  update profiles set role = 'seller' where id = seller;
  insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by)
    values (deal, '1 Check Way, Belmont (fictional)', 'normal', '2026-10-01', 30, 0, agent, agent);
  insert into deal_members (deal_id, profile_id, member_role) values (deal, seller, 'seller');
  insert into leads (kind, email, name, message) values ('contact', 'check-0035-lead@example.test', 'Check Example', 'A question (fictional)') returning id into lead;
  -- Routing assigns new leads on insert; give this one to the agent afterwards.
  update leads set assigned_to = agent where id = lead;

  -- The deal's agent, who is also assigned the lead.
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  begin insert into ai_drafts (kind, lead_id, subject, body) values ('call_followup', lead, 'Thanks for the call', 'Hi,'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('followup_lead', r);
  begin insert into ai_drafts (kind, deal_id, subject, body, content) values ('appointment', deal, 'Walkthrough', 'Hi,', appt); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('appointment_deal', r);
  begin insert into ai_drafts (kind, lead_id, deal_id, subject, body) values ('call_followup', lead, deal, 'x', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('both_targets', r);
  begin insert into ai_drafts (kind, deal_id, subject, body) values ('appointment', deal, 'x', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('appointment_no_content', r);
  begin insert into staff_todos (deal_id, title) values (deal, 'Send the HOA documents') returning id into todo; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('todo_deal', r);
  begin insert into staff_todos (lead_id, title, due_date, source) values (lead, 'Call back', current_date + 2, 'call_notes'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('todo_lead', r);
  begin insert into staff_todos (deal_id, title, created_by) values (deal, 'x', agent2); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('todo_other_name', r);
  select count(*) into n from staff_todos; out := out || jsonb_build_object('agent_sees', n);
  update staff_todos set done = true, done_at = now() where id = todo;
  get diagnostics n = row_count; out := out || jsonb_build_object('done', n::text);
  reset role;

  -- An agent who works neither.
  perform set_config('request.jwt.claims', json_build_object('sub', agent2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent2::text, true);
  set local role authenticated;
  select count(*) into n from staff_todos; out := out || jsonb_build_object('agent2_sees', n);
  begin insert into staff_todos (deal_id, title) values (deal, 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_todo', r);
  begin insert into ai_drafts (kind, lead_id, subject, body) values ('call_followup', lead, 'x', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent2_drafts', r);
  reset role;

  -- The seller.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  select count(*) into n from staff_todos; out := out || jsonb_build_object('seller_sees', n);
  select count(*) into n from tasks where title = 'Send the HOA documents'; out := out || jsonb_build_object('seller_tasks_has_todo', n);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from staff_todos; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0035 %', out;
end $$;
