-- Deals + membership. Access model (CLAUDE.md): agents read only their own
-- deals; sellers read only the deal they're a member of; VA/TC get access via
-- membership; admin sees all. No bank/wiring columns exist by design.

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  escrow_number text,
  seller_name text,
  seller_type public.seller_type not null default 'normal',
  ratification_date date not null,
  days_to_close int not null default 15 check (days_to_close between 1 and 120),
  rent_back_days int not null default 0 check (rent_back_days between 0 and 90),
  sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0),
  status public.deal_status not null default 'active',
  agent_id uuid references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create table public.deal_members (
  deal_id uuid not null references public.deals (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.deal_member_role not null,
  created_at timestamptz not null default now(),
  primary key (deal_id, profile_id)
);

create table public.deal_contingencies (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null,
  offset_days int not null check (offset_days >= 0),
  due_date date,
  removed_at timestamptz,
  unique (deal_id, kind)
);

create index deal_members_profile_idx on public.deal_members (profile_id);
create index deals_agent_idx on public.deals (agent_id);

create function public.has_deal_access(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (select 1 from deals d where d.id = p_deal_id and d.agent_id = auth.uid())
    or exists (
      select 1 from deal_members m
      where m.deal_id = p_deal_id and m.profile_id = auth.uid()
    );
$$;

alter table public.deals enable row level security;
alter table public.deal_members enable row level security;
alter table public.deal_contingencies enable row level security;

create policy "deals: members/agent/admin read"
  on public.deals for select to authenticated
  using (public.has_deal_access(id));

create policy "deals: staff create"
  on public.deals for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());

create policy "deals: staff with access update"
  on public.deals for update to authenticated
  using (public.is_staff() and public.has_deal_access(id))
  with check (public.is_staff() and public.has_deal_access(id));

create policy "deals: admin delete"
  on public.deals for delete to authenticated
  using (public.is_admin());

create policy "deal_members: own row or deal access reads"
  on public.deal_members for select to authenticated
  using (profile_id = auth.uid() or public.has_deal_access(deal_id));

create policy "deal_members: staff with access manage"
  on public.deal_members for all to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id))
  with check (public.is_staff() and public.has_deal_access(deal_id));

create policy "deal_contingencies: deal access reads"
  on public.deal_contingencies for select to authenticated
  using (public.has_deal_access(deal_id));

create policy "deal_contingencies: staff with access manage"
  on public.deal_contingencies for all to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id))
  with check (public.is_staff() and public.has_deal_access(deal_id));
