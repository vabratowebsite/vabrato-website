-- S6b PR 3: AI drafts in the console.
--
-- Four staff features, each behind its own flag (off): a reply to a lead, a
-- follow-up to an open-house visitor, an escrow update for the seller written
-- from the deal's tasks, and a quote request to a vendor.
--
-- SPEC <ai_rules>: a person approves every draft before it leaves (the agent
-- who asked for it), and AI never sends anything. Drafts are stored only
-- here. Discarded drafts, and drafts nobody approves, are deleted after 30
-- days; approved drafts stay with the lead or the transaction file. The
-- usage log (ai_runs) still holds no content: this row is the only copy of
-- the text.

insert into public.feature_flags (key, description) values
  ('ai_staff_lead_reply', 'VA assistant: draft a reply to a website lead. A person edits and approves it, then sends it from their own email.'),
  ('ai_staff_open_house_followup', 'VA assistant: draft a follow-up to an open-house visitor. A person edits and approves it, then sends it themselves.'),
  ('ai_staff_escrow_update', 'VA assistant: draft an escrow update for the seller from the deal''s task list. A person edits and approves it, then sends it themselves.'),
  ('ai_staff_vendor_request', 'VA assistant: draft a quote request to a vendor for a deal. A person edits and approves it, then sends it themselves.')
on conflict (key) do nothing;

create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('lead_reply', 'open_house_followup', 'escrow_update', 'vendor_request')),
  lead_id uuid references public.leads (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete cascade,
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  approved_at timestamptz,
  discarded_at timestamptz,
  sent_via text check (sent_via in ('email', 'copy', 'portal')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Each kind points at what it's about, and only that.
  check (case kind
    when 'lead_reply' then lead_id is not null and deal_id is null and vendor_id is null
    when 'open_house_followup' then lead_id is not null and deal_id is null and vendor_id is null
    when 'escrow_update' then deal_id is not null and lead_id is null and vendor_id is null
    when 'vendor_request' then deal_id is not null and vendor_id is not null and lead_id is null
  end),
  check ((status = 'approved') = (approved_at is not null)),
  check ((status = 'discarded') = (discarded_at is not null)),
  check (sent_via is null or status = 'approved')
);

create index ai_drafts_owner_idx on public.ai_drafts (owner_id, updated_at desc);
create index ai_drafts_lead_idx on public.ai_drafts (lead_id) where lead_id is not null;
create index ai_drafts_deal_idx on public.ai_drafts (deal_id) where deal_id is not null;
create index ai_drafts_purge_idx on public.ai_drafts (status, updated_at);

alter table public.ai_drafts enable row level security;

-- Whether the caller works the lead or deal a draft is about (staff only).
create function public.can_work_draft_target(p_lead uuid, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff()
     and ((p_lead is not null and public.can_work_lead(p_lead))
          or (p_deal is not null and public.has_deal_access(p_deal)));
$$;

-- Who asked for the draft sees and changes it while they still work that
-- lead or deal (not after a lead is reassigned away from them). Once
-- approved it's part of the lead or the transaction file, so staff who work
-- that lead or deal see it too.
create policy "ai_drafts: owner reads own"
  on public.ai_drafts for select to authenticated
  using (owner_id = auth.uid() and public.can_work_draft_target(lead_id, deal_id));
create policy "ai_drafts: staff read approved drafts on their leads and deals"
  on public.ai_drafts for select to authenticated
  using (status = 'approved' and public.can_work_draft_target(lead_id, deal_id));
create policy "ai_drafts: staff draft for leads and deals they work"
  on public.ai_drafts for insert to authenticated
  with check (owner_id = auth.uid() and status = 'draft' and public.can_work_draft_target(lead_id, deal_id));
create policy "ai_drafts: owner changes own"
  on public.ai_drafts for update to authenticated
  using (owner_id = auth.uid() and public.can_work_draft_target(lead_id, deal_id))
  with check (owner_id = auth.uid() and public.can_work_draft_target(lead_id, deal_id));

revoke all on public.ai_drafts from anon, authenticated;
grant select on public.ai_drafts to authenticated;
grant insert (kind, lead_id, deal_id, vendor_id, subject, body) on public.ai_drafts to authenticated;
grant update (subject, body, status, sent_via) on public.ai_drafts to authenticated;

-- What a change may do: edit while it's a draft; approve or discard it once;
-- after approval, only record how it was used. Holds for every caller.
create function public.ai_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind
     or new.lead_id is distinct from old.lead_id or new.deal_id is distinct from old.deal_id
     or new.vendor_id is distinct from old.vendor_id or new.created_at is distinct from old.created_at then
    raise exception 'draft_fixed_fields' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.subject is distinct from old.subject or new.body is distinct from old.body) then
    raise exception 'draft_closed' using errcode = '42501',
      hint = 'An approved or discarded draft can''t be edited. Write a new one.';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'draft' then
      raise exception 'draft_closed' using errcode = '42501';
    end if;
    if new.status = 'approved' then
      new.approved_at := now();
    elsif new.status = 'discarded' then
      new.discarded_at := now();
    end if;
  else
    new.approved_at := old.approved_at;
    new.discarded_at := old.discarded_at;
  end if;
  if new.sent_via is distinct from old.sent_via then
    if new.status <> 'approved' then
      raise exception 'draft_not_approved' using errcode = '42501';
    end if;
    new.used_at := now();
  else
    new.used_at := old.used_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_drafts_guard before update on public.ai_drafts
  for each row execute function public.ai_drafts_guard();

-- Daily: discarded drafts 30 days after they were discarded, and drafts
-- nobody approved or discarded 30 days after their last change.
create function public.purge_ai_drafts()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from ai_drafts
    where (status = 'discarded' and discarded_at < now() - interval '30 days')
       or (status = 'draft' and updated_at < now() - interval '30 days')
    returning 1
  )
  select count(*)::integer from gone;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('vabrato-purge-ai-drafts', '41 11 * * *', 'select public.purge_ai_drafts()')$q$;
  end if;
end;
$$;

revoke execute on function public.can_work_draft_target(uuid, uuid) from public, anon;
revoke execute on function public.ai_drafts_guard() from public, anon, authenticated;
revoke execute on function public.purge_ai_drafts() from public, anon, authenticated;
grant execute on function public.can_work_draft_target(uuid, uuid) to authenticated;
grant execute on function public.purge_ai_drafts() to service_role;
