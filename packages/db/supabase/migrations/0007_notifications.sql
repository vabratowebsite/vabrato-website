-- Scheduled notification sends (Resend). Bodies are static templates keyed by
-- template_key (CLAUDE.md: no runtime AI in seller/buyer notifications);
-- payload carries only merge fields like dates and address.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  recipient_profile_id uuid references public.profiles (id) on delete cascade,
  recipient_email text,
  template_key text not null,
  payload jsonb not null default '{}',
  send_at timestamptz not null,
  sent_at timestamptz,
  status public.notification_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  check (recipient_profile_id is not null or recipient_email is not null)
);

create index notifications_send_idx on public.notifications (status, send_at);

alter table public.notifications enable row level security;

create policy "notifications: recipient reads own"
  on public.notifications for select to authenticated
  using (recipient_profile_id = auth.uid());

create policy "notifications: staff with deal access read"
  on public.notifications for select to authenticated
  using (deal_id is not null and public.is_staff() and public.has_deal_access(deal_id));

create policy "notifications: staff with deal access manage"
  on public.notifications for all to authenticated
  using (deal_id is not null and public.is_staff() and public.has_deal_access(deal_id))
  with check (deal_id is not null and public.is_staff() and public.has_deal_access(deal_id));
