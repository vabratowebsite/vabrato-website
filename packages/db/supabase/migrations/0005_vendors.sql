-- Vendor rolodex (va app). Org-wide, staff-only.

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  phone text,
  email text,
  preferred boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.deal_vendors (
  deal_id uuid not null references public.deals (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (deal_id, vendor_id)
);

alter table public.vendors enable row level security;
alter table public.deal_vendors enable row level security;

create policy "vendors: staff only"
  on public.vendors for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "deal_vendors: staff with access"
  on public.deal_vendors for all to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id))
  with check (public.is_staff() and public.has_deal_access(deal_id));
