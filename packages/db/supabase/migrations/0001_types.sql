-- Shared enums and utility trigger. All app tables live in `public`.

create type public.user_role as enum ('admin', 'agent', 'va', 'tc', 'seller', 'buyer');
create type public.seller_type as enum ('normal', 'trust', 'successor_trustee', 'probate');
create type public.deal_status as enum ('active', 'closed', 'cancelled');
create type public.task_phase as enum ('after_ratification', 'closing_week', 'after_coe');
create type public.deal_member_role as enum ('seller', 'agent', 'va', 'tc');
create type public.receipt_source as enum ('drive', 'dropbox', 'manual');
create type public.notification_status as enum ('scheduled', 'sent', 'cancelled', 'failed');

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
