-- Feature flags and VOW Terms acceptance (S3). Both are needed by the MLS
-- RLS policies in 0012.
--
-- feature_flags: everyone can read flags (pages need them signed out); only
-- admins can flip `enabled`. New flags are added by migration.
-- public_sold / public_stats gate public display of our own sold listings
-- and market statistics (SPEC MLS-10): OFF until MLSListings confirms in
-- writing.
--
-- profiles.vow_accepted_at: set when a member accepts the VOW Terms of Use
-- (SPEC MLS-6). Written by the service role only (the acceptance flow lands
-- in S5); 0002's column grants already stop members from setting it.

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default now()
);

create trigger feature_flags_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

alter table public.feature_flags enable row level security;

insert into public.feature_flags (key, description) values
  ('public_sold', 'MLS-10: show Vabrato''s own sold listings on public pages. Off until MLSListings confirms in writing.'),
  ('public_stats', 'MLS-10: show public market statistics (city pages, Insights). Off until MLSListings confirms in writing.');

create policy "feature_flags: anyone reads"
  on public.feature_flags for select to anon, authenticated
  using (true);

create policy "feature_flags: admin flips"
  on public.feature_flags for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, update, delete, truncate on public.feature_flags from anon, authenticated;
grant update (enabled) on public.feature_flags to authenticated;

create function public.flag_enabled(p_key text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select enabled from feature_flags where key = p_key), false);
$$;

alter table public.profiles add column vow_accepted_at timestamptz;

comment on column public.profiles.vow_accepted_at is
  'When the member accepted the VOW Terms of Use (MLS-6). Service role only.';
