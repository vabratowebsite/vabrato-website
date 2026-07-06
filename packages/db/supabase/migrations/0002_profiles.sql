-- Profiles mirror auth.users. Role defaults to 'buyer'; staff/seller roles are
-- assigned via the service role (admin tooling), never self-service — column
-- grants below prevent any authenticated user from touching `role`.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'buyer',
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile on signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS helpers. security definer so they read profiles/memberships without
-- recursing into the caller's row policies.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'agent', 'va', 'tc')
  );
$$;

create policy "profiles: read own or staff reads all"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No self-service role/email changes: authenticated may only update full_name.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
