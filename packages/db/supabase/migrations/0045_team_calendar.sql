-- One team Google Calendar instead of a calendar per person (owner answers
-- 2026-11-16/17). Replaces the calendar half of 0042.
--
-- An admin connects one Google account once. The console creates its own
-- calendar ("Vabrato") in that account, and puts every approved appointment
-- and every deal's key dates on it (not cancelled or test deals), each titled
-- with who it's for. The owner shares that calendar with the team in Google
-- Calendar. The console asks Google only for calendars it creates, so it
-- can't see or change any other calendar in the account, and it never invites
-- anyone.
--
-- team_calendar holds the one connection: the encrypted refresh token (AES-
-- 256-GCM, key in server env) and the calendar's id. Like staff_connections,
-- RLS is on with no policies and nothing is granted: only the server, with
-- the service role, reads it. team_calendar_status() shows staff whether it's
-- connected, without the token.
--
-- team_calendar_events records which events we put on it, so a sync updates
-- or removes exactly those. Staff read it (the appointment page says whether
-- an appointment is on the calendar); the server writes it.
--
-- The per-person tables from 0042 (calendar_events, staff_calendar_prefs) are
-- dropped: the calendar switch was never on, and both are empty on hosted.
-- staff_connections stays: Google Drive and Dropbox imports are per person.

update public.feature_flags
set description = 'Google Calendar: one team calendar ("Vabrato") in the Google account an admin connects. The console adds every approved appointment and every deal''s key dates; the owner shares the calendar with the team. It never reads other calendars or invites anyone.'
where key = 'integration_google_calendar';

drop table public.calendar_events;
drop table public.staff_calendar_prefs;

-- The connection ---------------------------------------------------------------------------------

create table public.team_calendar (
  singleton boolean primary key default true check (singleton),
  connected_by uuid references public.profiles (id) on delete set null,
  account_email text check (account_email is null or char_length(account_email) <= 254),
  scopes text[] not null default '{}' check (cardinality(scopes) <= 10),
  token_ciphertext text not null check (char_length(token_ciphertext) between 20 and 4096),
  calendar_id text check (calendar_id is null or char_length(calendar_id) between 1 and 1024),
  calendar_name text check (calendar_name is null or char_length(calendar_name) between 1 and 100),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text check (last_error is null or last_error in ('reconnect', 'sync_failed', 'calendar_gone')),
  -- One sync at a time (several people's actions can start one together): a
  -- sync takes this lease for a couple of minutes and clears it when done.
  sync_lock_until timestamptz
);

alter table public.team_calendar enable row level security;
-- No policies on purpose: only the service role reads or writes this table.
revoke all on public.team_calendar from anon, authenticated;

-- Events we put on it --------------------------------------------------------------------------------

create table public.team_calendar_events (
  source_key text primary key check (source_key ~ '^(appt:[0-9a-f-]{36}|deal:[0-9a-f-]{36}:(coe|rentback|cr:[a-z_]{1,40}))$'),
  google_event_id text not null check (char_length(google_event_id) between 1 and 1024),
  content_hash text not null check (char_length(content_hash) = 64),
  updated_at timestamptz not null default now()
);

alter table public.team_calendar_events enable row level security;
create policy "team_calendar_events: staff read"
  on public.team_calendar_events for select to authenticated
  using (public.is_staff());
revoke all on public.team_calendar_events from anon, authenticated;
grant select on public.team_calendar_events to authenticated;

-- Whether it's connected, for staff. Never the token.
create function public.team_calendar_status()
returns table (
  connected boolean,
  connected_by_name text,
  account_email text,
  calendar_name text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  events integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  return query
    select
      t.singleton is not null,
      coalesce(nullif(btrim(p.full_name), ''), p.email),
      t.account_email,
      t.calendar_name,
      t.connected_at,
      t.last_synced_at,
      t.last_error,
      (select count(*)::integer from team_calendar_events)
    from (select 1) one
    left join team_calendar t on true
    left join profiles p on p.id = t.connected_by;
end;
$$;

revoke execute on function public.team_calendar_status() from public, anon;
grant execute on function public.team_calendar_status() to authenticated;
