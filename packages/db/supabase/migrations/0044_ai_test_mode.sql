-- AI test mode before Zero Data Retention (owner answers 2026-11-16).
--
-- The master switch ai_enabled stays off until Anthropic's written ZDR
-- confirmation is recorded (0027). Until then, an admin can turn on
-- ai_test_mode so named testers can try the AI features without any real
-- client record reaching the model:
--
-- - Only profiles with ai_tester = true (set by admins, audited) can run AI.
-- - A request about a deal runs only if that deal is a test deal
--   (deals.is_test, chosen when the deal is created and locked after).
-- - A request about no deal runs only for features that use the tester's own
--   typed text or uploaded file (ai_test_scope). Features that read other
--   people's stored records (briefing, data questions, member summary, lead
--   drafts, lead calls) and features that send MLS data stay off.
-- - In test mode one switch covers every eligible feature; the per-feature
--   ai_* switches are ignored, so none is pre-armed for the real launch.
-- - Once ai_enabled is on, the normal path applies (feature switches, every
--   eligible user); test mode then changes nothing and stays until an admin
--   turns it off.
--
-- ai_begin (0026) is redefined with the test-mode branch; its access checks,
-- limits and budget are unchanged. ai_features_available gives the UIs the
-- same answer ai_begin would, so neither app re-implements the rule.

insert into public.feature_flags (key, description) values
  ('ai_test_mode', 'AI test mode before Zero Data Retention: named testers only, on test deals and their own typed text or uploads. Real client records never reach the model. Ignored once ai_enabled is on.')
on conflict (key) do nothing;

-- Test deals ------------------------------------------------------------------------------------

alter table public.deals add column is_test boolean not null default false;

comment on column public.deals.is_test is
  'A deal with fictional data, for trying features (AI test mode). Chosen when the deal is created; can''t be changed afterwards.';

create function public.deals_is_test_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_test is distinct from old.is_test then
    raise exception 'is_test_locked' using errcode = '42501',
      hint = 'Whether a deal is a test deal is set when it''s created and can''t be changed.';
  end if;
  return new;
end;
$$;

create trigger deals_is_test_lock before update on public.deals
  for each row execute function public.deals_is_test_lock();

-- Testers ---------------------------------------------------------------------------------------

alter table public.profiles add column ai_tester boolean not null default false;

comment on column public.profiles.ai_tester is
  'May use AI in test mode (before Zero Data Retention). Set by admins with set_ai_tester.';

create function public.set_ai_tester(p_email text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select id into target from profiles where lower(email) = lower(btrim(coalesce(p_email, '')));
  if target is null then
    raise exception 'not_found' using errcode = 'P0002',
      hint = 'No account with that email. The person signs in once first.';
  end if;
  update profiles set ai_tester = coalesce(p_on, false), updated_at = now() where id = target;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'set_ai_tester', 'profiles', target::text, jsonb_build_object('on', coalesce(p_on, false)));
end;
$$;

create function public.ai_testers()
returns table (email text, full_name text, role text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select p.email, p.full_name, p.role::text from profiles p where p.ai_tester order by p.email;
end;
$$;

-- The rule --------------------------------------------------------------------------------------

-- Test mode only: may this feature run for this deal (or no deal)? With a
-- deal: only features that work on that one deal, and only on a test deal (a
-- feature that reads other records, like the briefing, never qualifies by
-- being handed a test deal). With no deal: only the typed-input features.
create function public.ai_test_scope(p_feature text, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_deal is not null then
      p_feature = any (array[
        'staff_document_check', 'staff_counter_changes', 'staff_receipt_reader', 'staff_inspection_items',
        'staff_repair_response', 'staff_escrow_update', 'staff_vendor_request', 'staff_call_notes', 'staff_appointments',
        'member_summarize', 'member_draft', 'member_cover_letter'
      ])
      and coalesce((select d.is_test from deals d where d.id = p_deal), false)
    else p_feature = any (array[
      -- The tester's own upload at deal intake.
      'staff_contract_reader',
      -- The member's own typed text, own uploads and own plans.
      'member_explain', 'member_search', 'member_summarize', 'member_draft', 'member_cover_letter',
      'member_moving', 'member_prelisting', 'member_palette', 'member_staging', 'member_flyer'
    ])
  end;
$$;

-- Why a feature may not run for the caller now, or null when it may.
-- Assumes the role and deal-access checks have passed. Reasons: off | test_only.
create function public.ai_refusal(p_feature text, p_deal uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.flag_enabled('ai_enabled') then
    return case when public.flag_enabled('ai_' || p_feature) then null else 'off' end;
  end if;
  if not public.flag_enabled('ai_test_mode')
     or not coalesce((select ai_tester from profiles where id = auth.uid()), false) then
    return 'off';
  end if;
  return case when public.ai_test_scope(p_feature, p_deal) then null else 'test_only' end;
end;
$$;

-- Called by packages/ai before every model call. Returns
-- {"allowed": true, "run_id": …} or {"allowed": false, "reason": …} where
-- reason is off | test_only | daily_requests | daily_tokens | monthly_budget.
create or replace function public.ai_begin(p_feature text, p_deal uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  for_staff boolean;
  s app_settings;
  reqs integer;
  toks bigint;
  spent bigint;
  run uuid;
  refusal text;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_feature is null or p_feature !~ '^(staff|member)_[a-z0-9_]{2,40}$' then
    raise exception 'unknown_feature' using errcode = '22023';
  end if;
  for_staff := left(p_feature, 6) = 'staff_';
  if for_staff and not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not for_staff and not exists (select 1 from profiles where id = uid and role in ('buyer', 'seller', 'both')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_deal is not null and not public.has_deal_access(p_deal) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  refusal := public.ai_refusal(p_feature, p_deal);
  if refusal is not null then
    return jsonb_build_object('allowed', false, 'reason', refusal);
  end if;

  select * into s from app_settings;
  select count(*), coalesce(sum(input_tokens + output_tokens), 0) into reqs, toks
    from ai_runs where profile_id = uid and created_at >= public.ai_period_start('day');
  if reqs >= (case when for_staff then s.ai_daily_requests_staff else s.ai_daily_requests_member end) then
    return jsonb_build_object('allowed', false, 'reason', 'daily_requests');
  end if;
  if toks >= (case when for_staff then s.ai_daily_tokens_staff else s.ai_daily_tokens_member end) then
    return jsonb_build_object('allowed', false, 'reason', 'daily_tokens');
  end if;
  select coalesce(sum(cost_micros), 0) into spent from ai_runs where created_at >= public.ai_period_start('month');
  if spent >= s.ai_monthly_budget_usd::bigint * 1000000 then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_budget');
  end if;

  insert into ai_runs (profile_id, feature, deal_id) values (uid, p_feature, p_deal) returning id into run;
  return jsonb_build_object('allowed', true, 'run_id', run);
end;
$$;

-- What the UIs show: {"mode": "off" | "live" | "test", "features": {"<feature>": true|false}}.
-- A feature is true when ai_begin would let the caller start it now (limits
-- aside): the right kind of account, access to the deal, and no refusal.
create function public.ai_features_available(p_features text[], p_deal uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  staff boolean := public.is_staff();
  member boolean;
  deal_ok boolean;
  mode text;
  f text;
  result jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  member := exists (select 1 from profiles where id = uid and role in ('buyer', 'seller', 'both'));
  deal_ok := p_deal is null or public.has_deal_access(p_deal);
  mode := case
    when public.flag_enabled('ai_enabled') then 'live'
    when public.flag_enabled('ai_test_mode') and coalesce((select ai_tester from profiles where id = uid), false) then 'test'
    else 'off'
  end;
  foreach f in array coalesce(p_features, '{}'::text[]) loop
    if f is null or f !~ '^(staff|member)_[a-z0-9_]{2,40}$' then
      continue;
    end if;
    result := result || jsonb_build_object(f,
      deal_ok
      and (case when left(f, 6) = 'staff_' then staff else member end)
      and public.ai_refusal(f, p_deal) is null);
  end loop;
  return jsonb_build_object('mode', mode, 'features', result);
end;
$$;

revoke execute on function public.deals_is_test_lock() from public, anon, authenticated;
revoke execute on function public.set_ai_tester(text, boolean) from public, anon;
revoke execute on function public.ai_testers() from public, anon;
revoke execute on function public.ai_test_scope(text, uuid) from public, anon, authenticated;
revoke execute on function public.ai_refusal(text, uuid) from public, anon, authenticated;
revoke execute on function public.ai_features_available(text[], uuid) from public, anon;

grant execute on function public.set_ai_tester(text, boolean) to authenticated;
grant execute on function public.ai_testers() to authenticated;
grant execute on function public.ai_features_available(text[], uuid) to authenticated;
