-- S6 PR 2a: lead routing and the staff notification pipeline.
--
-- * Routing (SPEC <lead_routing>): every lead goes to the lead admin (Mark),
--   or to the backup (Viv) while Mark is marked away. Settings live on the
--   single app_settings row and change only through set_lead_routing() and
--   set_lead_admin_away(). No routing set yet: leads stay unassigned and
--   every role admin is told.
-- * Visibility: the acting lead admin (Mark, or Viv while Mark is away) sees
--   every lead; everyone else sees only leads assigned to them. Until routing
--   is set up, role admins see all (bootstrap).
-- * Lead and message alerts are queued in the same transaction as the row
--   (email row + in-console row), then the console's sender is poked over
--   pg_net. A pg_cron sweep every minute re-pokes, escalates unanswered
--   leads and flags overdue email. A failure in any of this is logged to
--   notification_errors and never rejects the lead or message.
-- * Sending is safe to run twice at once: rows are claimed with
--   FOR UPDATE SKIP LOCKED; send errors retry with backoff, then fail.
-- * pg_net, pg_cron and Vault calls are guarded, so the PGlite tests and
--   local runs work without them.

-- Extensions (hosted Supabase has both available) ----------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
end;
$$;

-- Routing settings -------------------------------------------------------------------

alter table public.app_settings
  add column lead_admin_id uuid references public.profiles (id) on delete set null,
  add column backup_admin_id uuid references public.profiles (id) on delete set null,
  add column lead_admin_away boolean not null default false,
  add column lead_admin_away_until timestamptz,
  add column lead_escalation_minutes integer not null default 120 check (lead_escalation_minutes between 15 and 1440),
  add column lead_flood_cap integer not null default 10 check (lead_flood_cap between 1 and 1000),
  add column mls_sync_live boolean not null default false;

create or replace function public.app_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_agent_reference(new.default_agent_id)
     or not public.check_agent_reference(new.lead_admin_id)
     or not public.check_agent_reference(new.backup_admin_id) then
    raise exception 'routing ids must reference an agent or admin' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Mark is away now: the flag is on and the "until" time (if any) hasn't passed.
create function public.lead_admin_away_now()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lead_admin_away and (lead_admin_away_until is null or lead_admin_away_until > now()) from app_settings), false);
$$;

-- Who a new lead goes to: the backup while the lead admin is away, else the
-- lead admin; either one when the other isn't set; null when neither is.
create function public.lead_router()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.lead_admin_away_now() then coalesce(s.backup_admin_id, s.lead_admin_id)
              else coalesce(s.lead_admin_id, s.backup_admin_id) end
  from app_settings s;
$$;

-- Mark, or Viv while Mark is away. Nothing else grants this.
create function public.is_acting_lead_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from app_settings s
    where s.lead_admin_id = auth.uid()
       or (s.backup_admin_id = auth.uid() and public.lead_admin_away_now())
  );
$$;

-- Routing settings: the acting lead admin, or any role admin.
create function public.can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_acting_lead_admin() or public.is_admin();
$$;

-- Lead visibility without routing set up: role admins see everything.
create function public.lead_routing_unset()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lead_admin_id is null and backup_admin_id is null from app_settings), true);
$$;

-- Audit, errors, in-console notifications ---------------------------------------------

create table public.staff_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 64),
  ref_table text check (char_length(ref_table) <= 64),
  ref_id text check (char_length(ref_id) <= 64),
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 4096),
  created_at timestamptz not null default now()
);

create index staff_audit_created_idx on public.staff_audit (created_at desc);

alter table public.staff_audit enable row level security;
create policy "staff_audit: admins read"
  on public.staff_audit for select to authenticated
  using (public.is_admin() or public.is_acting_lead_admin());
revoke all on public.staff_audit from anon, authenticated;
grant select on public.staff_audit to authenticated;

create table public.notification_errors (
  id bigint generated always as identity primary key,
  source text not null check (char_length(source) <= 120),
  detail text not null check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.notification_errors enable row level security;
create policy "notification_errors: admins read"
  on public.notification_errors for select to authenticated
  using (public.is_admin() or public.is_acting_lead_admin());
revoke all on public.notification_errors from anon, authenticated;
grant select on public.notification_errors to authenticated;

create table public.staff_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'new_lead', 'lead_digest', 'lead_reassigned', 'lead_escalated', 'new_message',
    'delivery_failed', 'delivery_overdue', 'routing_missing', 'sync_alert', 'sync_recovered')),
  ref_table text check (char_length(ref_table) <= 64),
  ref_id text check (char_length(ref_id) <= 64),
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index staff_notifications_recipient_idx on public.staff_notifications (recipient_id, created_at desc);

alter table public.staff_notifications enable row level security;
create policy "staff_notifications: own"
  on public.staff_notifications for select to authenticated
  using (recipient_id = auth.uid());
revoke all on public.staff_notifications from anon, authenticated;
grant select on public.staff_notifications to authenticated;

create function public.mark_staff_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update staff_notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Internal: one in-console row (no-op without a recipient).
create function public.staff_notify(p_recipient uuid, p_kind text, p_title text, p_ref_table text default null, p_ref_id text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into staff_notifications (recipient_id, kind, title, ref_table, ref_id)
  select p_recipient, p_kind, left(p_title, 200), p_ref_table, p_ref_id
  where p_recipient is not null;
$$;

-- Internal: every role admin (fallback when nobody is routed).
create function public.role_admin_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where role = 'admin';
$$;

-- Notifications: claims and retries --------------------------------------------------------

alter table public.notifications
  add column attempts integer not null default 0 check (attempts >= 0),
  add column claimed_at timestamptz;

-- Claims up to p_batch due rows for one sender run. A claim older than five
-- minutes (a crashed run) can be claimed again. Two runs at once never get
-- the same row.
create function public.claim_due_notifications(p_batch integer default 50)
returns table (
  id uuid,
  template_key text,
  payload jsonb,
  recipient_email text,
  profile_email text,
  alerts_email_opt_in boolean,
  attempts integer
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select n.id from notifications n
    where n.status = 'scheduled' and n.send_at <= now()
      and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
    order by n.send_at
    limit least(greatest(coalesce(p_batch, 50), 1), 200)
    for update skip locked
  ),
  claimed as (
    update notifications n set claimed_at = now(), attempts = n.attempts + 1
    from due where n.id = due.id
    returning n.id, n.template_key, n.payload, n.recipient_email, n.recipient_profile_id, n.attempts
  )
  select c.id, c.template_key, c.payload, c.recipient_email, p.email, p.alerts_email_opt_in, c.attempts
  from claimed c left join profiles p on p.id = c.recipient_profile_id;
$$;

create function public.complete_notification(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update notifications set status = 'sent', sent_at = now(), claimed_at = null, failure_reason = null
  where id = p_id and status = 'scheduled';
$$;

-- A send failed. Permanent failures (no address, unknown template) and the
-- fifth attempt end as 'failed' and alert the admins in the console; other
-- failures retry after attempts² minutes.
create function public.release_notification(p_id uuid, p_reason text, p_permanent boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n notifications;
  admin uuid;
begin
  select * into n from notifications where id = p_id and status = 'scheduled';
  if not found then
    return 'gone';
  end if;
  if p_permanent or n.attempts >= 5 then
    update notifications set status = 'failed', claimed_at = null, failure_reason = left(coalesce(p_reason, 'failed'), 500) where id = p_id;
    for admin in select public.role_admin_ids() loop
      perform public.staff_notify(admin, 'delivery_failed', 'An email could not be sent (' || n.template_key || ')', 'notifications', p_id::text);
    end loop;
    return 'failed';
  end if;
  update notifications
     set claimed_at = null,
         send_at = now() + make_interval(mins => n.attempts * n.attempts),
         failure_reason = left(coalesce(p_reason, 'retry'), 500)
   where id = p_id;
  return 'retry';
end;
$$;

-- Poke the console's sender (pg_net, after commit). The URL and secret come
-- from Supabase Vault; without them, or without pg_net, this does nothing
-- and the in-console alerts still work.
create function public.poke_notification_sender()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_bypass text;
  v_headers jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'console_process_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'console_cron_secret';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_bypass using 'console_bypass_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;
  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
  if v_bypass is not null then
    v_headers := v_headers || jsonb_build_object('x-vercel-protection-bypass', v_bypass);
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)' using v_url, '{}'::jsonb, v_headers;
  return true;
exception when others then
  insert into notification_errors (source, detail) values ('poke', left(sqlerrm, 1000));
  return false;
end;
$$;

-- Leads ---------------------------------------------------------------------------------

alter table public.leads
  add column first_reply_at timestamptz,
  add column closed_reason text check (closed_reason is null or char_length(closed_reason) <= 200),
  add column escalated_at timestamptz;

create index leads_assigned_idx on public.leads (assigned_to, created_at desc);

-- Routing happens in the BEFORE trigger (RLS checks run after it, so the
-- insert policy no longer requires assigned_to to be null; clients can't
-- write assigned_to anyway: it isn't in the column grant).
create or replace function public.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.status := 'new';
  new.assigned_to := public.lead_router();
  new.first_reply_at := null;
  new.escalated_at := null;
  new.closed_reason := null;
  if (select count(*) from leads where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'lead_rate_limited' using errcode = 'P0001', hint = 'email';
  end if;
  if new.ip_hash is not null and
     (select count(*) from leads where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'lead_rate_limited' using errcode = 'P0001', hint = 'ip';
  end if;
  return new;
end;
$$;

drop policy "leads: public submits" on public.leads;
create policy "leads: public submits" on public.leads for insert to anon, authenticated
  with check (
    status = 'new'
    and kind <> 'open_house_signin'
    and (profile_id is null or profile_id = auth.uid())
  );

drop policy "leads: staff read" on public.leads;
create policy "leads: lead admin all, others their own"
  on public.leads for select to authenticated
  using (
    public.is_acting_lead_admin()
    or (public.is_staff() and assigned_to = auth.uid())
    or (public.is_admin() and public.lead_routing_unset())
  );

-- Lead changes go through the functions below only.
drop policy "leads: admin manages" on public.leads;
revoke update on public.leads from authenticated;

-- First name only, for alerts ("J." when there's no name).
create function public.lead_first_name(p_name text, p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(split_part(btrim(coalesce(p_name, '')), ' ', 1), ''), upper(left(split_part(p_email, '@', 1), 1)) || '.');
$$;

create function public.lead_kind_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'contact' then 'contact request'
    when 'valuation' then 'home valuation request'
    when 'tour' then 'tour request'
    when 'transform' then 'Transform project request'
    when 'newsletter' then 'newsletter sign-up'
    when 'open_house_signin' then 'open-house sign-in'
    else 'request' end;
$$;

-- Queue the alerts for one lead and one recipient: an in-console row, and an
-- email (or, past the hourly flood cap, a 15-minute digest).
create function public.queue_lead_alert(p_lead uuid, p_recipient uuid, p_kind text default 'new_lead')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l leads;
  first_name text;
  label text;
  cap integer;
  recent integer;
  bucket timestamptz;
  template text;
begin
  select * into l from leads where id = p_lead;
  if not found or p_recipient is null then
    return;
  end if;
  first_name := public.lead_first_name(l.name, l.email);
  label := public.lead_kind_label(l.kind::text);
  template := case p_kind when 'lead_reassigned' then 'staff_lead_reassigned' when 'lead_escalated' then 'staff_lead_escalated' else 'staff_new_lead' end;

  perform public.staff_notify(
    p_recipient,
    p_kind,
    case p_kind
      when 'lead_reassigned' then 'Lead reassigned to you: ' || label || ' from ' || first_name
      when 'lead_escalated' then 'No reply yet: ' || label || ' from ' || first_name
      else 'New ' || label || ' from ' || first_name end,
    'leads', l.id::text);

  select lead_flood_cap into cap from app_settings;
  select count(*) into recent from notifications
   where recipient_profile_id = p_recipient and template_key = 'staff_new_lead' and created_at > now() - interval '1 hour';

  if p_kind = 'new_lead' and recent >= coalesce(cap, 10) then
    bucket := to_timestamp(ceil(extract(epoch from now()) / 900) * 900);
    insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
    values (p_recipient, 'staff_lead_digest', jsonb_build_object('count', 1), bucket, 'lead-digest:' || p_recipient || ':' || extract(epoch from bucket)::bigint)
    on conflict (dedupe_key) do update
      set payload = jsonb_build_object('count', coalesce((notifications.payload ->> 'count')::integer, 0) + 1);
  else
    insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
    values (p_recipient, template,
            jsonb_build_object('leadId', l.id, 'kind', label, 'firstName', first_name, 'site', l.site),
            now(), p_kind || ':' || l.id || ':' || p_recipient)
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

-- AFTER INSERT on leads: alert the assignee (or every role admin when
-- nobody is routed), then poke the sender. Never fails the insert.
create function public.leads_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin uuid;
  any_admin boolean := false;
begin
  begin
    if new.assigned_to is not null then
      perform public.queue_lead_alert(new.id, new.assigned_to);
    else
      for admin in select public.role_admin_ids() loop
        any_admin := true;
        perform public.queue_lead_alert(new.id, admin);
        perform public.staff_notify(admin, 'routing_missing', 'Lead routing isn''t set up: new leads aren''t assigned', 'app_settings', null);
      end loop;
      if not any_admin then
        insert into notification_errors (source, detail) values ('lead:' || new.id, 'no lead admin, backup or role admin to notify');
      end if;
    end if;
    perform public.poke_notification_sender();
  exception when others then
    insert into notification_errors (source, detail) values ('lead:' || new.id, left(sqlerrm, 1000));
  end;
  return null;
end;
$$;

create trigger leads_after_insert after insert on public.leads
  for each row execute function public.leads_after_insert();

-- The assignee or the acting lead admin may work a lead.
create function public.can_work_lead(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_acting_lead_admin()
      or exists (select 1 from leads where id = p_lead and assigned_to = auth.uid() and public.is_staff());
$$;

create function public.reassign_lead(p_lead uuid, p_agent uuid)
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
  if p_agent is null or not exists (select 1 from profiles where id = p_agent and role in ('agent', 'admin')) then
    raise exception 'not_an_agent' using errcode = '23514';
  end if;
  select assigned_to into previous from leads where id = p_lead for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update leads set assigned_to = p_agent, status = case when status = 'closed' then status else 'assigned' end where id = p_lead;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'reassign_lead', 'leads', p_lead::text, jsonb_build_object('from', previous, 'to', p_agent));
  if p_agent is distinct from auth.uid() then
    perform public.queue_lead_alert(p_lead, p_agent, 'lead_reassigned');
    perform public.poke_notification_sender();
  end if;
end;
$$;

create function public.set_lead_status(p_lead uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('new', 'assigned', 'closed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  if not public.can_work_lead(p_lead) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update leads
     set status = p_status,
         closed_reason = case when p_status = 'closed' then left(nullif(btrim(p_reason), ''), 200) else null end
   where id = p_lead;
end;
$$;

-- "I've replied": records the first reply time (median first reply on Today).
create function public.mark_lead_replied(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_work_lead(p_lead) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update leads set first_reply_at = coalesce(first_reply_at, now()),
                   status = case when status = 'new' then 'assigned' else status end
   where id = p_lead;
end;
$$;

create table public.lead_notes (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at);

alter table public.lead_notes enable row level security;
-- Same visibility as the lead (the subquery runs under the leads policy).
create policy "lead_notes: whoever sees the lead reads"
  on public.lead_notes for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_notes.lead_id));
create policy "lead_notes: staff who can work the lead add"
  on public.lead_notes for insert to authenticated
  with check (author_id = auth.uid() and public.can_work_lead(lead_id));
revoke all on public.lead_notes from anon, authenticated;
grant select on public.lead_notes to authenticated;
grant insert (lead_id, author_id, body) on public.lead_notes to authenticated;

-- Routing settings RPCs ----------------------------------------------------------------

create function public.set_lead_routing(
  p_lead_admin uuid,
  p_backup_admin uuid,
  p_escalation_minutes integer default 120,
  p_flood_cap integer default 10
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_settings() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update app_settings
     set lead_admin_id = p_lead_admin,
         backup_admin_id = p_backup_admin,
         lead_escalation_minutes = coalesce(p_escalation_minutes, lead_escalation_minutes),
         lead_flood_cap = coalesce(p_flood_cap, lead_flood_cap),
         updated_at = now();
  insert into staff_audit (actor_id, action, ref_table, detail)
  values (auth.uid(), 'set_lead_routing', 'app_settings',
          jsonb_build_object('lead_admin', p_lead_admin, 'backup_admin', p_backup_admin, 'escalation_minutes', p_escalation_minutes, 'flood_cap', p_flood_cap));
end;
$$;

create function public.set_lead_admin_away(p_away boolean, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_settings() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_away and p_until is not null and p_until <= now() then
    raise exception 'until_in_past' using errcode = '22023';
  end if;
  update app_settings
     set lead_admin_away = coalesce(p_away, false),
         lead_admin_away_until = case when p_away then p_until else null end,
         updated_at = now();
  insert into staff_audit (actor_id, action, ref_table, detail)
  values (auth.uid(), case when p_away then 'away_on' else 'away_off' end, 'app_settings', jsonb_build_object('until', p_until));
end;
$$;

-- Messages: alert the other side --------------------------------------------------------

-- A member writes: their assigned agent (else the lead router, else every
-- role admin) gets an in-console row and at most one email per 15 minutes
-- per thread. Staff write: the member gets one email per 15 minutes. No
-- message text in any email.
create function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  admin uuid;
  member_name text;
  bucket bigint := (floor(extract(epoch from now()) / 900))::bigint;
begin
  begin
    select public.lead_first_name(full_name, email), agent_id into member_name, recipient from profiles where id = new.member_id;
    if new.sender_id = new.member_id then
      recipient := coalesce(recipient, public.lead_router());
      if recipient is null then
        for admin in select public.role_admin_ids() loop
          perform public.staff_notify(admin, 'new_message', 'New message from ' || member_name, 'messages', new.member_id::text);
        end loop;
      else
        perform public.staff_notify(recipient, 'new_message', 'New message from ' || member_name, 'messages', new.member_id::text);
        insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
        values (recipient, 'staff_new_message', jsonb_build_object('memberId', new.member_id, 'firstName', member_name), now(),
                'msg-staff:' || new.member_id || ':' || recipient || ':' || bucket)
        on conflict (dedupe_key) do nothing;
      end if;
    else
      insert into notifications (recipient_profile_id, template_key, payload, send_at, dedupe_key)
      values (new.member_id, 'member_new_message', '{}'::jsonb, now(), 'msg-member:' || new.member_id || ':' || bucket)
      on conflict (dedupe_key) do nothing;
    end if;
    perform public.poke_notification_sender();
  exception when others then
    insert into notification_errors (source, detail) values ('message:' || new.id, left(sqlerrm, 1000));
  end;
  return null;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

-- The minute sweep (pg_cron) ------------------------------------------------------------

create function public.notification_sweep()
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
  return jsonb_build_object('escalated', escalated, 'overdue', overdue, 'poked', poked);
end;
$$;

-- Retention: 24 months by default, keeping leads linked to a member account.
create or replace function public.purge_old_leads(p_months integer default 24)
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from leads
    where created_at < now() - make_interval(months => p_months) and profile_id is null
    returning 1
  )
  select count(*)::integer from gone;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('vabrato-notification-sweep', '* * * * *', 'select public.notification_sweep()')$q$;
    execute $q$select cron.schedule('vabrato-purge-old-leads', '23 11 * * *', 'select public.purge_old_leads()')$q$;
  end if;
end;
$$;

-- Deletion queue: the acting lead admin works it too -------------------------------------

drop policy "account_deletion_requests: admin reads all" on public.account_deletion_requests;
create policy "account_deletion_requests: admins read all"
  on public.account_deletion_requests for select to authenticated
  using (public.is_admin() or public.is_acting_lead_admin());
drop policy "account_deletion_requests: admin handles" on public.account_deletion_requests;
create policy "account_deletion_requests: admins handle"
  on public.account_deletion_requests for update to authenticated
  using (public.is_admin() or public.is_acting_lead_admin())
  with check (public.is_admin() or public.is_acting_lead_admin());

-- Function privileges ---------------------------------------------------------------------

revoke execute on function public.lead_admin_away_now() from public, anon;
revoke execute on function public.lead_router() from public, anon, authenticated;
revoke execute on function public.is_acting_lead_admin() from public, anon;
revoke execute on function public.can_manage_settings() from public, anon;
revoke execute on function public.lead_routing_unset() from public, anon;
revoke execute on function public.mark_staff_notifications_read(bigint[]) from public, anon;
revoke execute on function public.staff_notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.role_admin_ids() from public, anon, authenticated;
revoke execute on function public.claim_due_notifications(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification(uuid) from public, anon, authenticated;
revoke execute on function public.release_notification(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.poke_notification_sender() from public, anon, authenticated;
revoke execute on function public.lead_first_name(text, text) from public, anon;
revoke execute on function public.lead_kind_label(text) from public, anon;
revoke execute on function public.queue_lead_alert(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.leads_after_insert() from public, anon, authenticated;
revoke execute on function public.can_work_lead(uuid) from public, anon;
revoke execute on function public.reassign_lead(uuid, uuid) from public, anon;
revoke execute on function public.set_lead_status(uuid, text, text) from public, anon;
revoke execute on function public.mark_lead_replied(uuid) from public, anon;
revoke execute on function public.set_lead_routing(uuid, uuid, integer, integer) from public, anon;
revoke execute on function public.set_lead_admin_away(boolean, timestamptz) from public, anon;
revoke execute on function public.messages_after_insert() from public, anon, authenticated;
revoke execute on function public.notification_sweep() from public, anon, authenticated;

grant execute on function public.lead_admin_away_now() to authenticated;
grant execute on function public.is_acting_lead_admin() to authenticated;
grant execute on function public.can_manage_settings() to authenticated;
grant execute on function public.lead_routing_unset() to authenticated;
grant execute on function public.mark_staff_notifications_read(bigint[]) to authenticated;
grant execute on function public.lead_first_name(text, text) to authenticated;
grant execute on function public.lead_kind_label(text) to authenticated;
grant execute on function public.can_work_lead(uuid) to authenticated;
grant execute on function public.reassign_lead(uuid, uuid) to authenticated;
grant execute on function public.set_lead_status(uuid, text, text) to authenticated;
grant execute on function public.mark_lead_replied(uuid) to authenticated;
grant execute on function public.set_lead_routing(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.set_lead_admin_away(boolean, timestamptz) to authenticated;
grant execute on function public.claim_due_notifications(integer) to service_role;
grant execute on function public.complete_notification(uuid) to service_role;
grant execute on function public.release_notification(uuid, text, boolean) to service_role;
grant execute on function public.notification_sweep() to service_role;
grant execute on function public.poke_notification_sender() to service_role;
