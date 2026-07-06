-- Buyer property tracker. A buyer reads only properties they track. Inbound
-- email parsing is deterministic per-source (CLAUDE.md); raw emails are
-- service-role-only (webhook writes, parser reads) — no RLS policies on
-- inbound_emails means no authenticated access at all.

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- e.g. 'postmark', 'sendgrid'
  raw jsonb not null,
  parsed_ok boolean not null default false,
  received_at timestamptz not null default now()
);

create table public.tracked_properties (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  address text not null,
  source text,
  status text not null default 'watching',
  created_at timestamptz not null default now()
);

create table public.property_events (
  id uuid primary key default gen_random_uuid(),
  tracked_property_id uuid not null references public.tracked_properties (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  source_email_id uuid references public.inbound_emails (id),
  occurred_at timestamptz not null default now()
);

create index tracked_properties_buyer_idx on public.tracked_properties (buyer_id);
create index property_events_property_idx on public.property_events (tracked_property_id);

alter table public.inbound_emails enable row level security;
alter table public.tracked_properties enable row level security;
alter table public.property_events enable row level security;

create policy "tracked_properties: buyer owns rows"
  on public.tracked_properties for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

-- Events are written by the (service-role) email parser; buyers read theirs.
create policy "property_events: buyer reads own"
  on public.property_events for select to authenticated
  using (
    exists (
      select 1 from public.tracked_properties p
      where p.id = tracked_property_id and p.buyer_id = auth.uid()
    )
  );
