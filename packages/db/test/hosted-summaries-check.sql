-- S6b PR 4 check for the HOSTED project (0029): the three switches exist and
-- are off, and signed-in users can't turn them on directly. Read-only apart
-- from one update attempted as a signed-in user inside a block that always
-- rolls back. No model is called.
--
-- Expected, and seen on hosted (2026-11-12):
--   flags "ai_staff_daily_briefing=false,ai_staff_data_questions=false,ai_staff_member_summary=false"
--   authenticated_update "denied" (only admins, through set_ai_flag)
do $$
declare
  out jsonb := '{}';
  r text;
begin
  out := out || jsonb_build_object('flags', (select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_staff_daily_briefing', 'ai_staff_member_summary', 'ai_staff_data_questions')));
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000029ff', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000029ff', true);
  set local role authenticated;
  begin
    update feature_flags set enabled = true where key = 'ai_staff_daily_briefing';
    r := case when found then 'allowed' else 'denied' end;
  exception when others then r := 'denied';
  end;
  reset role;
  out := out || jsonb_build_object('authenticated_update', r);
  raise exception 'CHECK_0029 %', out;
end $$;
