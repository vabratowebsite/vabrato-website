-- S6 PR 3: members, MLS sync alerts, FULL access (ACC-1).
--
-- * set_member_agent(): the acting lead admin assigns a member's agent
--   (audited). Members still can't change their own agent (0016 guard).
-- * MLS sync alerts: while the feed is live (app_settings.mls_sync_live), the
--   minute sweep checks mls_sync_health(); a failed or late sync (no success
--   in 30 minutes) alerts admins and the lead admin once per incident, in the
--   console and by email, and once more when it recovers.
-- * verify_agent_access(): the console calls it (service role) at every staff
--   sign-in with MLS_OFFICE_ID. Same rules as packages/mls verifyAgentAccess:
--   an active MLSListings member of our office with that email gets access;
--   otherwise any active access is switched off.
-- * full_data_enabled flag (off): has_full_mls_access() also requires it, so
--   no FULL data is visible anywhere until MLSListings confirms FULL access
--   in writing (data reality, Nov 10).

-- Members --------------------------------------------------------------------------------

create function public.set_member_agent(p_member uuid, p_agent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous uuid;
begin
  if not public.is_acting_lead_admin() then
    raise exception 'lead_admin_only' using errcode = '42501';
  end if;
  if p_agent is not null and not public.check_agent_reference(p_agent) then
    raise exception 'not_an_agent' using errcode = '23514';
  end if;
  select agent_id into previous from profiles where id = p_member and role in ('buyer', 'seller', 'both') for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update profiles set agent_id = p_agent where id = p_member;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'set_member_agent', 'profiles', p_member::text, jsonb_build_object('from', previous, 'to', p_agent));
end;
$$;

-- MLS sync alerts ----------------------------------------------------------------------------

create table public.sync_alert_state (
  id boolean primary key default true check (id),
  incident_open boolean not null default false,
  opened_at timestamptz,
  closed_at timestamptz
);

insert into public.sync_alert_state default values;

alter table public.sync_alert_state enable row level security;
create policy "sync_alert_state: staff read"
  on public.sync_alert_state for select to authenticated
  using (public.is_staff());
revoke all on public.sync_alert_state from anon, authenticated;
grant select on public.sync_alert_state to authenticated;

-- Admins and the lead admin (deduplicated).
create function public.sync_alert_recipients()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where role = 'admin'
  union
  select lead_admin_id from app_settings where lead_admin_id is not null;
$$;

create function public.check_sync_health()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  live boolean;
  h record;
  st sync_alert_state;
  bad boolean;
  last_ok text;
  r uuid;
  kind text;
begin
  select mls_sync_live into live from app_settings;
  if not coalesce(live, false) then
    return 'not_live';
  end if;
  select * into h from public.mls_sync_health();
  bad := h.stale or h.last_status = 'failed';
  select * into st from sync_alert_state for update;
  last_ok := coalesce(to_char(h.last_success_at at time zone 'America/Los_Angeles', 'Mon DD, HH12:MI AM') || ' PT', 'never');

  if bad and not st.incident_open then
    update sync_alert_state set incident_open = true, opened_at = now(), closed_at = null;
    kind := 'sync_alert';
  elsif not bad and st.incident_open then
    update sync_alert_state set incident_open = false, closed_at = now();
    kind := 'sync_recovered';
  else
    return case when bad then 'open' else 'ok' end;
  end if;

  for r in select public.sync_alert_recipients() loop
    perform public.staff_notify(r, kind,
      case kind when 'sync_alert' then 'MLS sync needs attention (last success ' || last_ok || ')' else 'MLS sync is back to normal' end,
      'mls_sync_runs', null);
    insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
    values (r, 'staff_' || kind, jsonb_build_object('lastSuccess', last_ok), now(),
            kind || ':' || r || ':' || extract(epoch from now())::bigint)
    on conflict (dedupe_key) do nothing;
  end loop;
  return kind;
end;
$$;

create function public.set_mls_sync_live(p_live boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_settings() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update app_settings set mls_sync_live = coalesce(p_live, false), updated_at = now();
  -- Start clean: no stale incident carried over from before going live.
  update sync_alert_state set incident_open = false, closed_at = now() where not coalesce(p_live, false);
  insert into staff_audit (actor_id, action, ref_table, detail)
  values (auth.uid(), 'set_mls_sync_live', 'app_settings', jsonb_build_object('live', p_live));
end;
$$;

-- The minute sweep (0022) also checks sync health now.
create or replace function public.notification_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s app_settings;
  l record;
  target uuid;
  admin uuid;
  escalated integer := 0;
  overdue integer;
  poked boolean := false;
  sync text;
begin
  select * into s from app_settings;

  -- Escalate leads nobody has answered within the configured time.
  for l in
    select id, assigned_to from leads
    where status = 'new' and first_reply_at is null and escalated_at is null
      and created_at < now() - make_interval(mins => coalesce(s.lead_escalation_minutes, 120))
    order by created_at limit 50
  loop
    target := case when l.assigned_to is not distinct from s.backup_admin_id then s.lead_admin_id else s.backup_admin_id end;
    update leads set escalated_at = now() where id = l.id;
    if target is not null and target is distinct from l.assigned_to then
      perform public.queue_lead_alert(l.id, target, 'lead_escalated');
      escalated := escalated + 1;
    end if;
  end loop;

  -- MLS sync health (only while the feed is live).
  begin
    sync := public.check_sync_health();
  exception when others then
    insert into notification_errors (source, detail) values ('sync_health', left(sqlerrm, 1000));
    sync := 'error';
  end;

  -- Email due for more than 2 minutes and still unsent: tell the admins in
  -- the console, at most once an hour.
  select count(*) into overdue from notifications where status = 'scheduled' and send_at < now() - interval '2 minutes';
  if overdue > 0 and not exists (select 1 from staff_notifications where kind = 'delivery_overdue' and created_at > now() - interval '1 hour') then
    for admin in select public.role_admin_ids() loop
      perform public.staff_notify(admin, 'delivery_overdue', overdue || ' email(s) waiting to be sent for over 2 minutes', 'notifications', null);
    end loop;
  end if;

  if exists (select 1 from notifications where status = 'scheduled' and send_at <= now()) then
    poked := public.poke_notification_sender();
  end if;
  return jsonb_build_object('escalated', escalated, 'overdue', overdue, 'poked', poked, 'sync', sync);
end;
$$;

-- ACC-1: FULL access at sign-in ---------------------------------------------------------------

create function public.verify_agent_access(p_profile uuid, p_email text, p_office text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m text;
  existing mls_agent_access;
begin
  if p_profile is null or coalesce(btrim(p_office), '') = '' then
    return jsonb_build_object('verified', false, 'member_key', null);
  end if;
  select member_key into m from mls_members
   where lower(email) = lower(p_email) and member_status = 'Active' and office_mls_id = p_office
   order by member_key limit 1;
  if m is not null then
    insert into mls_agent_access (profile_id, member_key, active, verified_at) values (p_profile, m, true, now())
    on conflict (profile_id) do update set member_key = excluded.member_key, active = true, verified_at = excluded.verified_at;
    return jsonb_build_object('verified', true, 'member_key', m);
  end if;
  select * into existing from mls_agent_access where profile_id = p_profile;
  if found and existing.active then
    update mls_agent_access set active = false where profile_id = p_profile;
  end if;
  return jsonb_build_object('verified', false, 'member_key', null);
end;
$$;

-- FULL data stays off until MLSListings confirms it ------------------------------------------------

insert into public.feature_flags (key, description) values
  ('full_data_enabled', 'ACC-1/MLS-7: FULL MLS data in the agent console for verified agents. Off until MLSListings confirms FULL access in writing.')
on conflict (key) do nothing;

create or replace function public.has_full_mls_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.flag_enabled('full_data_enabled') and exists (
    select 1
    from mls_agent_access a
    join mls_members m on m.member_key = a.member_key
    join profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid()
      and a.active
      and a.verified_at > now() - interval '36 hours'
      and m.member_status = 'Active'
      and p.role in ('admin', 'agent', 'va', 'tc')
  );
$$;

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.set_member_agent(uuid, uuid) from public, anon;
revoke execute on function public.sync_alert_recipients() from public, anon, authenticated;
revoke execute on function public.check_sync_health() from public, anon, authenticated;
revoke execute on function public.set_mls_sync_live(boolean) from public, anon;
revoke execute on function public.verify_agent_access(uuid, text, text) from public, anon, authenticated;

grant execute on function public.set_member_agent(uuid, uuid) to authenticated;
grant execute on function public.set_mls_sync_live(boolean) to authenticated;
grant execute on function public.check_sync_health() to service_role;
grant execute on function public.verify_agent_access(uuid, text, text) to service_role;
