-- S5 PR 1: member accounts.
--
-- * vow_enabled flag (default OFF): MLSListings hasn't made VOW available yet.
--   has_vow_access() now also requires it, so no member reads sold data or
--   price history until the flag is on (review item 1).
-- * app_settings.default_agent_id: the agent every new member is assigned to
--   (Mark), until S6 lead routing (review item 11).
-- * profiles: phone, agent_id, alert-email consent, VOW terms version,
--   onboarding time. Members change their own row only through the RPCs
--   below; direct UPDATE is still limited to full_name (0002 column grant),
--   so role, agent_id and the VOW columns can't be self-set (review item 6).
-- * Visibility narrowed (owner decision, S5 plan): admin sees every profile;
--   an agent sees members assigned to them; staff see clients on deals they
--   can access; staff see other staff. Replaces "staff reads all" (0002).
-- * account_deletion_requests: a member asks, an admin works the queue
--   (review item 14).
--
-- Every SECURITY DEFINER function sets search_path and has EXECUTE revoked
-- from public and anon.

-- Feature flag ---------------------------------------------------------------

insert into public.feature_flags (key, description) values
  ('vow_enabled', 'MLS-6: VOW data for members (sold prices, price history, sold search) and the VOW Terms checkbox. Off until MLSListings makes VOW available.');

create or replace function public.has_vow_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.flag_enabled('vow_enabled')
    and exists (select 1 from profiles where id = auth.uid() and vow_accepted_at is not null)
  ) or public.has_full_mls_access();
$$;

-- Settings -------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  default_agent_id uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

create policy "app_settings: staff read"
  on public.app_settings for select to authenticated
  using (public.is_staff());

create policy "app_settings: admin updates"
  on public.app_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
grant update (default_agent_id) on public.app_settings to authenticated;

-- Profiles -------------------------------------------------------------------

alter table public.profiles
  add column phone text check (phone is null or phone ~ '^[0-9+(). -]{7,32}$'),
  add column agent_id uuid references public.profiles (id) on delete set null,
  add column alerts_email_opt_in boolean not null default false,
  add column alerts_opt_in_at timestamptz,
  add column vow_terms_version text check (vow_terms_version is null or vow_terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add column onboarded_at timestamptz;

create index profiles_agent_id_idx on public.profiles (agent_id);

comment on column public.profiles.agent_id is 'Assigned agent (an agent or admin profile). Defaults to app_settings.default_agent_id at signup.';
comment on column public.profiles.alerts_opt_in_at is 'When the member last opted in to alert emails (null while opted out).';
comment on column public.profiles.vow_terms_version is 'Version of the VOW Terms of Use the member accepted, with vow_accepted_at.';

-- Assigned agents and the default agent must be an agent or admin.
create function public.check_agent_reference(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_id is null or exists (select 1 from profiles where id = p_id and role in ('agent', 'admin'));
$$;

create function public.profiles_agent_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.agent_id is not null and new.agent_id is distinct from old.agent_id
     and not public.check_agent_reference(new.agent_id) then
    raise exception 'agent_id must reference an agent or admin' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_agent_guard
  before update of agent_id on public.profiles
  for each row execute function public.profiles_agent_guard();

create function public.app_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_agent_reference(new.default_agent_id) then
    raise exception 'default_agent_id must reference an agent or admin' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger app_settings_guard
  before insert or update on public.app_settings
  for each row execute function public.app_settings_guard();

-- New members get the default agent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, agent_id)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    (select default_agent_id from public.app_settings where id)
  );
  return new;
end;
$$;

-- Who may see a member's profile (and, from S5 PR 2 on, their saved homes,
-- searches, messages and documents).
create function public.can_see_member(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile = auth.uid()
    or public.is_admin()
    or (
      public.is_staff()
      and (
        exists (
          select 1 from profiles p
          where p.id = p_profile
            and (p.role in ('admin', 'agent', 'va', 'tc') or p.agent_id = auth.uid())
        )
        or exists (
          select 1 from deal_members dm
          where dm.profile_id = p_profile and public.has_deal_access(dm.deal_id)
        )
      )
    );
$$;

drop policy "profiles: read own or staff reads all" on public.profiles;

create policy "profiles: read own, or members staff may see"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_see_member(id));

-- Member RPCs ----------------------------------------------------------------

-- Choose buyer, seller or both. Only for member roles; staff roles never
-- change here. A seller on a deal who picks "buyer" becomes "both", so the
-- seller view isn't lost.
create function public.set_member_role(p_role public.user_role)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.user_role;
  v_next public.user_role;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select role into v_current from profiles where id = auth.uid() for update;
  if v_current is null or v_current::text not in ('buyer', 'seller', 'both') then
    raise exception 'role_not_member' using errcode = '42501';
  end if;
  if p_role::text not in ('buyer', 'seller', 'both') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  v_next := p_role;
  if p_role::text = 'buyer' and exists (
    select 1 from deal_members where profile_id = auth.uid() and member_role = 'seller'
  ) then
    v_next := 'both';
  end if;
  update profiles set role = v_next where id = auth.uid();
  return v_next;
end;
$$;

create function public.update_my_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if length(v_name) > 120 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  update profiles set full_name = v_name, phone = v_phone where id = auth.uid();
end;
$$;

create function public.set_alert_emails(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  update profiles
  set alerts_email_opt_in = coalesce(p_on, false),
      alerts_opt_in_at = case when coalesce(p_on, false) then now() else null end
  where id = auth.uid();
end;
$$;

-- VOW Terms of Use acceptance (MLS-6). Refused while vow_enabled is off.
create function public.accept_vow_terms(p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.flag_enabled('vow_enabled') then
    raise exception 'vow_disabled' using errcode = 'P0001';
  end if;
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  update profiles set vow_accepted_at = now(), vow_terms_version = p_version
  where id = auth.uid()
  returning vow_accepted_at into v_at;
  return v_at;
end;
$$;

create function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  update profiles set onboarded_at = coalesce(onboarded_at, now()) where id = auth.uid();
end;
$$;

-- Account deletion requests (review item 14) --------------------------------

create type public.deletion_request_status as enum ('pending', 'completed', 'cancelled');

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  status public.deletion_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  note text check (note is null or length(note) <= 1000)
);

create unique index account_deletion_requests_one_pending
  on public.account_deletion_requests (profile_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests: member reads own"
  on public.account_deletion_requests for select to authenticated
  using (profile_id = auth.uid());

create policy "account_deletion_requests: admin reads all"
  on public.account_deletion_requests for select to authenticated
  using (public.is_admin());

create policy "account_deletion_requests: admin handles"
  on public.account_deletion_requests for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant update (status, handled_by, handled_at, note) on public.account_deletion_requests to authenticated;

create function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select id into v_id from account_deletion_requests where profile_id = auth.uid() and status = 'pending';
  if v_id is null then
    insert into account_deletion_requests (profile_id) values (auth.uid()) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Function privileges ---------------------------------------------------------

revoke execute on function public.check_agent_reference(uuid) from public, anon, authenticated;
revoke execute on function public.profiles_agent_guard() from public, anon, authenticated;
revoke execute on function public.app_settings_guard() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.can_see_member(uuid) from public, anon;
revoke execute on function public.set_member_role(public.user_role) from public, anon;
revoke execute on function public.update_my_profile(text, text) from public, anon;
revoke execute on function public.set_alert_emails(boolean) from public, anon;
revoke execute on function public.accept_vow_terms(text) from public, anon;
revoke execute on function public.complete_onboarding() from public, anon;
revoke execute on function public.request_account_deletion() from public, anon;

grant execute on function public.can_see_member(uuid) to authenticated;
grant execute on function public.set_member_role(public.user_role) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.set_alert_emails(boolean) to authenticated;
grant execute on function public.accept_vow_terms(text) to authenticated;
grant execute on function public.complete_onboarding() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;

-- 0014 granted these to anon without revoking PUBLIC first. anon and
-- authenticated keep their explicit grants.
revoke execute on function public.mls_last_updated() from public;
revoke execute on function public.public_own_sold(integer) from public;
