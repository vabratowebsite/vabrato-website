-- Member drafts for the HOSTED project (0038). Run after applying 0038: Supabase
-- SQL editor, or the Supabase MCP execute_sql. No model is called and nothing
-- is sent.
--
-- It creates a fictional agent, a buyer assigned to that agent, a second buyer
-- and a seller, then switches to authenticated / anon per person. It always
-- ends with RAISE EXCEPTION: the "error" message carries the results as JSON,
-- and the abort rolls back every row it created.
--
-- Expected:
--   flags "ai_member_cover_letter=false,ai_member_draft=false"
--   buyer_saves "allowed", buyer_for_other "denied…", seller_cover "denied…", agent_saves "denied…"
--   buyer_sees 2, buyer2_sees 0, agent_sees 0 (private), anon "denied…"
--   recipient_change "denied…", cover_by_email "denied…", used "agent"
--   purge_by_buyer "denied…", purged 1 (an aged draft), cron 1 (or 0 without pg_cron)
--   deleted 2 (one draft, one waiting to-do), left_drafts 0
do $$
declare
  agent uuid := 'c1000000-0000-4000-8000-0000000038c1';
  buyer uuid := 'f1000000-0000-4000-8000-0000000038f1';
  buyer2 uuid := 'f2000000-0000-4000-8000-0000000038f2';
  seller uuid := 'e1000000-0000-4000-8000-0000000038e1';
  out jsonb := '{}';
  r text; n int; a uuid; b uuid;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_member_draft', 'ai_member_cover_letter')));
  insert into auth.users (id, email, instance_id, aud, role) values
    (agent, 'check-0038-agent@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer, 'check-0038-buyer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (buyer2, 'check-0038-buyer2@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (seller, 'check-0038-seller@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'agent' where id = agent;
  update profiles set role = 'buyer', agent_id = agent where id = buyer;
  update profiles set role = 'buyer' where id = buyer2;
  update profiles set role = 'seller' where id = seller;

  -- The buyer saves a message and a cover letter.
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  begin
    insert into member_drafts (kind, recipient, about, subject, body) values ('message', 'movers', '1 Fixture Way, Belmont', 'Our move', 'Hi, could you move us on the 14th?') returning id into a;
    insert into member_drafts (kind, recipient, about, body) values ('cover_letter', 'agent', '1 Fixture Way, Belmont', 'We can close in 21 days.') returning id into b;
    r := 'allowed';
  exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_saves', r);
  begin insert into member_drafts (profile_id, kind, recipient, body) values (buyer2, 'message', 'movers', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('buyer_for_other', r);
  select count(*) into n from member_drafts; out := out || jsonb_build_object('buyer_sees', n);
  begin update member_drafts set recipient = 'lender' where id = a; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('recipient_change', r);
  begin update member_drafts set sent_via = 'email' where id = b; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('cover_by_email', r);
  update member_drafts set sent_via = 'agent' where id = b;
  out := out || jsonb_build_object('used', (select sent_via from member_drafts where id = b and used_at is not null));
  begin perform public.purge_member_drafts(); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('purge_by_buyer', r);
  reset role;

  -- A seller can't save a cover letter; the agent and another buyer see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', seller::text, true);
  set local role authenticated;
  begin insert into member_drafts (kind, recipient, body) values ('cover_letter', 'agent', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('seller_cover', r);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', buyer2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer2::text, true);
  set local role authenticated;
  select count(*) into n from member_drafts; out := out || jsonb_build_object('buyer2_sees', n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', agent::text, true);
  set local role authenticated;
  select count(*) into n from member_drafts; out := out || jsonb_build_object('agent_sees', n);
  begin insert into member_drafts (kind, recipient, body) values ('message', 'movers', 'x'); r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('agent_saves', r);
  reset role;

  -- The purge deletes the cover letter once aged past 30 days.
  alter table member_drafts disable trigger member_drafts_guard;
  update member_drafts set updated_at = now() - interval '31 days' where id = b;
  alter table member_drafts enable trigger member_drafts_guard;
  out := out || jsonb_build_object('purged', public.purge_member_drafts());
  out := out || jsonb_build_object('cron', (select count(*) from pg_extension e where e.extname = 'pg_cron'));
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(*) from cron.job where jobname = 'vabrato-purge-member-drafts'$q$ into n;
    out := out || jsonb_build_object('cron', n);
  end if;

  -- "Delete my assistant data" removes the remaining draft and a waiting to-do.
  insert into member_todos (profile_id, title) values (buyer, 'Waiting to-do');
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  set local role authenticated;
  out := out || jsonb_build_object('deleted', public.delete_my_assistant_data());
  select count(*) into n from member_drafts; out := out || jsonb_build_object('left_drafts', n);
  reset role;

  -- The public.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin select count(*) into n from member_drafts; r := 'allowed'; exception when others then r := 'denied: ' || sqlerrm; end;
  out := out || jsonb_build_object('anon', r);
  reset role;

  raise exception 'CHECK_0038 %', out;
end $$;
