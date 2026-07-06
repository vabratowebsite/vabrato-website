-- Receipts for reimbursement demands. Money-adjacent: staff-only, sellers and
-- buyers never read these. Files land in the 'receipts' storage bucket;
-- storage_path points there.

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  vendor text not null,
  receipt_date date not null,
  amount numeric(10, 2) not null check (amount >= 0),
  category text not null default 'Other',
  source public.receipt_source not null default 'manual',
  storage_path text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index receipts_deal_idx on public.receipts (deal_id);

alter table public.receipts enable row level security;

create policy "receipts: staff with access"
  on public.receipts for all to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id))
  with check (public.is_staff() and public.has_deal_access(deal_id));
