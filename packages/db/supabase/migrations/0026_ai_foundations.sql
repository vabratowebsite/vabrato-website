-- AI foundations (SPEC <ai_rules>): switches, usage limits and a usage log.
-- No AI feature ships in this migration.
--
-- * ai_enabled is the master switch (off). Every AI feature also has its own
--   flag, named ai_<feature>, added by the migration that ships the feature.
--   A feature runs only while both are on. Nothing is turned on until
--   Anthropic confirms Zero Data Retention in writing.
-- * Feature names start with staff_ (agent console) or member_ (/my). Staff
--   features are for staff only; member features for buyers and sellers only.
-- * ai_runs records each request: who, which feature, tokens, cost, how it
--   ended. Metadata only: it has no column for the question, the documents or
--   the answer. Only admins read it; everyone else sees their own totals
--   through ai_usage_today().
-- * Limits (app_settings, changed by admins with set_ai_limits): requests and
--   tokens per person per Pacific day, and a monthly spending stop for the
--   whole site. ai_begin() checks them before any model call.

insert into public.feature_flags (key, description) values
  ('ai_enabled', 'Master switch for every AI feature (SPEC <ai_rules>). Off until Anthropic confirms Zero Data Retention in writing. Each feature also needs its own ai_* flag.')
on conflict (key) do nothing;

alter table public.app_settings
  add column ai_daily_requests_staff integer not null default 100 check (ai_daily_requests_staff between 0 and 10000),
  add column ai_daily_requests_member integer not null default 30 check (ai_daily_requests_member between 0 and 10000),
  add column ai_daily_tokens_staff integer not null default 3000000 check (ai_daily_tokens_staff between 0 and 100000000),
  add column ai_daily_tokens_member integer not null default 300000 check (ai_daily_tokens_member between 0 and 100000000),
  add column ai_monthly_budget_usd integer not null default 100 check (ai_monthly_budget_usd between 0 and 100000);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature ~ '^(staff|member)_[a-z0-9_]{2,40}$'),
  deal_id uuid references public.deals (id) on delete set null,
  status text not null default 'started' check (status in ('started', 'ok', 'blocked_input', 'blocked_output', 'refused', 'error')),
  model text check (model is null or char_length(model) <= 60),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  -- Millionths of a US dollar.
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_runs_profile_idx on public.ai_runs (profile_id, created_at desc);
create index ai_runs_created_idx on public.ai_runs (created_at);

alter table public.ai_runs enable row level security;
create policy "ai_runs: admins read usage"
  on public.ai_runs for select to authenticated
  using (public.is_admin());
revoke all on public.ai_runs from anon, authenticated;
grant select on public.ai_runs to authenticated;

-- Start of the caller's current Pacific day and month.
create function public.ai_period_start(p_unit text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (date_trunc(p_unit, (now() at time zone 'America/Los_Angeles'))) at time zone 'America/Los_Angeles';
$$;

-- Called by packages/ai before every model call. Returns
-- {"allowed": true, "run_id": …} or {"allowed": false, "reason": …} where
-- reason is off | daily_requests | daily_tokens | monthly_budget.
create function public.ai_begin(p_feature text, p_deal uuid default null)
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
  if not (public.flag_enabled('ai_enabled') and public.flag_enabled('ai_' || p_feature)) then
    return jsonb_build_object('allowed', false, 'reason', 'off');
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

-- Called by packages/ai when a request ends. A run is closed once, by the
-- person who started it. The run id never reaches the browser.
create function public.ai_finish(
  p_run uuid,
  p_status text,
  p_model text default null,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_cache_read_tokens integer default 0,
  p_cost_micros bigint default 0,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status is null or p_status not in ('ok', 'blocked_input', 'blocked_output', 'refused', 'error') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  update ai_runs
     set status = p_status,
         model = left(p_model, 60),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         cache_read_tokens = greatest(coalesce(p_cache_read_tokens, 0), 0),
         cost_micros = greatest(coalesce(p_cost_micros, 0), 0),
         duration_ms = case when p_duration_ms >= 0 then p_duration_ms end,
         finished_at = now()
   where id = p_run and profile_id = auth.uid() and status = 'started';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- The caller's own usage today, with their limits (for "3 of 30 used").
create function public.ai_usage_today()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', public.flag_enabled('ai_enabled'),
    'requests', (select count(*) from ai_runs where profile_id = auth.uid() and created_at >= public.ai_period_start('day')),
    'tokens', (select coalesce(sum(input_tokens + output_tokens), 0) from ai_runs where profile_id = auth.uid() and created_at >= public.ai_period_start('day')),
    'requests_limit', case when public.is_staff() then s.ai_daily_requests_staff else s.ai_daily_requests_member end,
    'tokens_limit', case when public.is_staff() then s.ai_daily_tokens_staff else s.ai_daily_tokens_member end
  )
  from app_settings s
  where auth.uid() is not null;
$$;

-- Admins change the limits (null keeps the current value). Audited.
create function public.set_ai_limits(
  p_requests_staff integer default null,
  p_requests_member integer default null,
  p_tokens_staff integer default null,
  p_tokens_member integer default null,
  p_monthly_budget_usd integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update app_settings set
    ai_daily_requests_staff = coalesce(p_requests_staff, ai_daily_requests_staff),
    ai_daily_requests_member = coalesce(p_requests_member, ai_daily_requests_member),
    ai_daily_tokens_staff = coalesce(p_tokens_staff, ai_daily_tokens_staff),
    ai_daily_tokens_member = coalesce(p_tokens_member, ai_daily_tokens_member),
    ai_monthly_budget_usd = coalesce(p_monthly_budget_usd, ai_monthly_budget_usd),
    updated_at = now();
  insert into staff_audit (actor_id, action, ref_table, detail)
  values (auth.uid(), 'set_ai_limits', 'app_settings', jsonb_strip_nulls(jsonb_build_object(
    'requests_staff', p_requests_staff, 'requests_member', p_requests_member,
    'tokens_staff', p_tokens_staff, 'tokens_member', p_tokens_member, 'monthly_budget_usd', p_monthly_budget_usd)));
end;
$$;

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.ai_period_start(text) from public, anon;
revoke execute on function public.ai_begin(text, uuid) from public, anon;
revoke execute on function public.ai_finish(uuid, text, text, integer, integer, integer, bigint, integer) from public, anon;
revoke execute on function public.ai_usage_today() from public, anon;
revoke execute on function public.set_ai_limits(integer, integer, integer, integer, integer) from public, anon;

grant execute on function public.ai_period_start(text) to authenticated;
grant execute on function public.ai_begin(text, uuid) to authenticated;
grant execute on function public.ai_finish(uuid, text, text, integer, integer, integer, bigint, integer) to authenticated;
grant execute on function public.ai_usage_today() to authenticated;
grant execute on function public.set_ai_limits(integer, integer, integer, integer, integer) to authenticated;
