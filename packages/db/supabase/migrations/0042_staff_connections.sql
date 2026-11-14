-- Integrations PR 1: connected accounts and Google Calendar (console only;
-- owner answers 2026-11-14).
--
-- A staff member connects their own Google account so the console can put
-- their approved appointments and their deals' key dates on their own Google
-- Calendar. The console only writes events it made; it never reads the
-- calendar and never invites anyone.
--
-- staff_connections holds each person's encrypted refresh token. The app
-- encrypts it (AES-256-GCM, key in server env) before it gets here. RLS is on
-- with no policies and nothing is granted to signed-in users, so nobody, not
-- even the row's owner, reads it through the API: only the server, with the
-- service role. my_connections() shows a person their own connections
-- without the token.
--
-- calendar_events records which events we put on each person's calendar, so
-- a sync can update or remove exactly those. Each person reads their own; the
-- server writes them.
--
-- The switch integration_google_calendar ships off. Admins turn it on with
-- set_integration_flag (audited) once the Google OAuth client and the token
-- key are set in the console's environment.

insert into public.feature_flags (key, description) values
  ('integration_google_calendar', 'Google Calendar: staff can connect their own Google Calendar; the console adds their approved appointments and their deals'' key dates. It never reads the calendar or invites anyone.')
on conflict (key) do nothing;

-- Connections --------------------------------------------------------------------------------------

create table public.staff_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'dropbox')),
  account_email text check (account_email is null or char_length(account_email) <= 254),
  scopes text[] not null default '{}' check (cardinality(scopes) <= 10),
  token_ciphertext text not null check (char_length(token_ciphertext) between 20 and 4096),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text check (last_error is null or last_error in ('reconnect', 'sync_failed')),
  unique (profile_id, provider)
);

alter table public.staff_connections enable row level security;
-- No policies on purpose: only the service role reads or writes this table.
revoke all on public.staff_connections from anon, authenticated;

-- A person's own connections, without the token. Staff only.
create function public.my_connections()
returns table (
  provider text,
  account_email text,
  scopes text[],
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.provider, c.account_email, c.scopes, c.connected_at, c.last_synced_at, c.last_error
  from staff_connections c
  where c.profile_id = auth.uid() and public.is_staff()
  order by c.provider;
$$;

-- Events we put on calendars -------------------------------------------------------------------------

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  source_key text not null check (source_key ~ '^(appt:[0-9a-f-]{36}|deal:[0-9a-f-]{36}:(coe|rentback|cr:[a-z_]{1,40}))$'),
  google_event_id text not null check (char_length(google_event_id) between 1 and 1024),
  content_hash text not null check (char_length(content_hash) = 64),
  updated_at timestamptz not null default now(),
  unique (profile_id, source_key)
);

alter table public.calendar_events enable row level security;
create policy "calendar_events: own rows read"
  on public.calendar_events for select to authenticated
  using (profile_id = auth.uid() and public.is_staff());
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;

-- Calendar preferences ---------------------------------------------------------------------------

create table public.staff_calendar_prefs (
  profile_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  key_dates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.staff_calendar_prefs enable row level security;
create policy "staff_calendar_prefs: own row read"
  on public.staff_calendar_prefs for select to authenticated
  using (profile_id = auth.uid() and public.is_staff());
create policy "staff_calendar_prefs: own row add"
  on public.staff_calendar_prefs for insert to authenticated
  with check (profile_id = auth.uid() and public.is_staff());
create policy "staff_calendar_prefs: own row change"
  on public.staff_calendar_prefs for update to authenticated
  using (profile_id = auth.uid() and public.is_staff())
  with check (profile_id = auth.uid() and public.is_staff());
revoke all on public.staff_calendar_prefs from anon, authenticated;
grant select on public.staff_calendar_prefs to authenticated;
grant insert (profile_id, key_dates) on public.staff_calendar_prefs to authenticated;
grant update (key_dates, updated_at) on public.staff_calendar_prefs to authenticated;

-- The switch -------------------------------------------------------------------------------------

create function public.set_integration_flag(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^integration_[a-z0-9_]{2,50}$' then
    raise exception 'not_an_integration_flag' using errcode = '22023';
  end if;
  update feature_flags set enabled = coalesce(p_on, false), updated_at = now() where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), 'set_integration_flag', 'feature_flags', p_key, jsonb_build_object('enabled', coalesce(p_on, false)));
end;
$$;

revoke execute on function public.my_connections() from public, anon;
revoke execute on function public.set_integration_flag(text, boolean) from public, anon;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.set_integration_flag(text, boolean) to authenticated;
