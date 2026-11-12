-- S6b PR 2: AI controls for admins, a budget alert, and the contract reader.
--
-- * Zero Data Retention gate: the master switch (ai_enabled) can't be turned
--   on until an admin records that Anthropic's written Zero Data Retention
--   confirmation is on file (confirm_ai_zdr; SPEC <ai_rules>, open questions).
-- * set_ai_flag(): admins switch AI features on and off (audited).
-- * Budget alert: admins get a console alert when the month's AI spend passes
--   80% of the budget, and again when it reaches it (the assistant then
--   pauses until the budget is raised or the month ends).
-- * ai_month_summary(): this month's spend and requests by feature, for admins.
-- * Contract reader (ai_staff_contract_reader, off): staff upload a ratified
--   contract to a short-lived staging folder in deal-docs, in their own
--   folder; the console reads it and deletes it. Nothing the model returns is
--   stored: the person reviews the proposed values on the intake form.

insert into public.feature_flags (key, description) values
  ('ai_staff_contract_reader', 'VA assistant: read a ratified contract and propose the intake values (dates, contingencies, price, rent-back) with page references. A person confirms them.')
on conflict (key) do nothing;

-- Zero Data Retention gate ---------------------------------------------------------------------

alter table public.app_settings
  add column ai_zdr_confirmed_at timestamptz,
  add column ai_zdr_confirmed_by uuid references public.profiles (id) on delete set null,
  add column ai_zdr_note text check (ai_zdr_note is null or char_length(ai_zdr_note) <= 300);

create function public.confirm_ai_zdr(p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
  update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = auth.uid(), ai_zdr_note = left(btrim(p_note), 300), updated_at = now();
  insert into staff_audit (actor_id, action, ref_table, detail)
  values (auth.uid(), 'confirm_ai_zdr', 'app_settings', jsonb_build_object('note', left(btrim(p_note), 300)));
end;
$$;

-- Holds for every way of changing the flag, including direct SQL.
create function public.feature_flags_ai_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'ai_enabled' and new.enabled and not old.enabled
     and (select ai_zdr_confirmed_at from app_settings) is null then
    raise exception 'zdr_not_confirmed' using errcode = '42501',
      hint = 'Record Anthropic''s written Zero Data Retention confirmation first (confirm_ai_zdr).';
  end if;
  return new;
end;
$$;

create trigger feature_flags_ai_guard before update on public.feature_flags
  for each row execute function public.feature_flags_ai_guard();

create function public.set_ai_flag(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^ai_[a-z0-9_]{2,60}$' then
    raise exception 'not_an_ai_flag' using errcode = '22023';
  end if;
  update feature_flags set enabled = coalesce(p_on, false), updated_at = now() where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'set_ai_flag', 'feature_flags', p_key, jsonb_build_object('enabled', coalesce(p_on, false)));
end;
$$;

-- Budget alert ---------------------------------------------------------------------------------

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind in (
  'new_lead', 'lead_digest', 'lead_reassigned', 'lead_escalated', 'new_message',
  'delivery_failed', 'delivery_overdue', 'routing_missing', 'sync_alert', 'sync_recovered', 'ai_budget'));

create or replace function public.ai_finish(
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
declare
  cost bigint := greatest(coalesce(p_cost_micros, 0), 0);
  budget bigint;
  spent bigint;
  pct integer;
  admin uuid;
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
         cost_micros = cost,
         duration_ms = case when p_duration_ms >= 0 then p_duration_ms end,
         finished_at = now()
   where id = p_run and profile_id = auth.uid() and status = 'started';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Tell the admins once when this request takes the month past 80%, and
  -- once when it reaches the budget. Never fails the request.
  begin
    select ai_monthly_budget_usd::bigint * 1000000 into budget from app_settings;
    if budget > 0 and cost > 0 then
      select coalesce(sum(cost_micros), 0) into spent from ai_runs where created_at >= public.ai_period_start('month');
      pct := case
        when spent >= budget and spent - cost < budget then 100
        when spent * 5 >= budget * 4 and (spent - cost) * 5 < budget * 4 then 80
      end;
      if pct is not null then
        for admin in select public.role_admin_ids() loop
          perform public.staff_notify(admin, 'ai_budget',
            case pct when 100 then 'AI budget reached: the assistant is paused until the budget is raised or the month ends'
                     else 'AI budget: 80% of this month''s $' || (budget / 1000000) || ' is used' end,
            'app_settings', null);
        end loop;
      end if;
    end if;
  exception when others then
    insert into notification_errors (source, detail) values ('ai_budget', left(sqlerrm, 1000));
  end;
end;
$$;

-- This month's usage, for admins.
create function public.ai_month_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'budget_usd', s.ai_monthly_budget_usd,
      'spent_micros', coalesce((select sum(cost_micros) from ai_runs where created_at >= public.ai_period_start('month')), 0),
      'requests', (select count(*) from ai_runs where created_at >= public.ai_period_start('month')),
      'by_feature', coalesce((
        select jsonb_agg(jsonb_build_object('feature', f.feature, 'requests', f.requests, 'cost_micros', f.cost, 'not_ok', f.not_ok) order by f.cost desc, f.feature)
        from (
          select feature, count(*) as requests, coalesce(sum(cost_micros), 0) as cost, count(*) filter (where status not in ('ok', 'started')) as not_ok
          from ai_runs where created_at >= public.ai_period_start('month') group by feature
        ) f), '[]')
    )
    from app_settings s
  );
end;
$$;

-- Contract staging folder ------------------------------------------------------------------------

-- deal-docs/intake/<profile id>/<file>: a staff member's own short-lived
-- uploads, before a deal exists. The console deletes each file after reading
-- it. Other staff can't see them; admins can, as with every deal document.
create policy "deal-docs bucket: staff read their own intake uploads"
  on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs' and public.is_staff()
         and (storage.foldername(name))[1] = 'intake' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "deal-docs bucket: staff add their own intake uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-docs' and public.is_staff()
              and (storage.foldername(name))[1] = 'intake' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "deal-docs bucket: staff delete their own intake uploads"
  on storage.objects for delete to authenticated
  using (bucket_id = 'deal-docs' and public.is_staff()
         and (storage.foldername(name))[1] = 'intake' and (storage.foldername(name))[2] = auth.uid()::text);

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.confirm_ai_zdr(text) from public, anon;
revoke execute on function public.feature_flags_ai_guard() from public, anon, authenticated;
revoke execute on function public.set_ai_flag(text, boolean) from public, anon;
revoke execute on function public.ai_month_summary() from public, anon;

grant execute on function public.confirm_ai_zdr(text) to authenticated;
grant execute on function public.set_ai_flag(text, boolean) to authenticated;
grant execute on function public.ai_month_summary() to authenticated;
