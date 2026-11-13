-- S6b PR 8: call notes to to-dos and a follow-up draft, and appointment
-- drafts (owner answers 2026-11-13).
--
-- Two staff features, each behind its own switch (off):
-- - call notes: the assistant reads notes the person typed after a call and
--   suggests to-dos and a follow-up email. The person ticks the to-dos to add
--   (to the staff to-do list below) and edits and approves the email. The
--   notes themselves aren't kept (on a lead, a tick box saves them as a lead
--   note, 0022).
-- - appointments: from one sentence, the assistant proposes an appointment
--   (title, date, time, length, place) and a confirmation message. Our code
--   checks the fields; the person corrects and approves them. An approved
--   appointment gives a calendar file to download and a confirmation to copy,
--   email or print. Nothing goes on a calendar unless a person adds it.
--
-- Both are ai_drafts on one lead or one deal, so the 0028 policies apply.
--
-- staff_todos is a to-do list for staff on a lead or a deal. Sellers never
-- see it (the deal's schedule tasks, 0004, stay as they are). Staff who work
-- the lead or the deal read and change it, through can_work_draft_target
-- (0028); nobody else can.

insert into public.feature_flags (key, description) values
  ('ai_staff_call_notes', 'VA assistant: reads notes typed after a call and suggests to-dos and a follow-up email. A person ticks the to-dos to add and approves the email; the notes aren''t kept.'),
  ('ai_staff_appointments', 'VA assistant: turns one sentence into an appointment (date, time, length, place) and its confirmation. A person checks and approves it; it goes on a calendar only when they add the calendar file.')
on conflict (key) do nothing;

alter table public.ai_drafts drop constraint ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in (
  'lead_reply', 'open_house_followup', 'escrow_update', 'vendor_request',
  'listing_kit', 'listing_presentation', 'buyer_presentation',
  'market_update', 'cma_writeup',
  'inspection_items', 'repair_response',
  'call_followup', 'appointment'));

-- Each kind points at what it's about, and only that.
alter table public.ai_drafts drop constraint ai_drafts_check;
alter table public.ai_drafts add constraint ai_drafts_check check (case kind
  when 'lead_reply' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'open_house_followup' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'escrow_update' then deal_id is not null and lead_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'vendor_request' then deal_id is not null and vendor_id is not null and lead_id is null and listing_key is null and cma_id is null
  when 'listing_kit' then listing_key is not null and lead_id is null and deal_id is null and vendor_id is null and cma_id is null and content is not null
  when 'cma_writeup' then cma_id is not null and lead_id is null and deal_id is null and vendor_id is null and listing_key is null and content is not null
  when 'inspection_items' then deal_id is not null and lead_id is null and vendor_id is null and listing_key is null and cma_id is null and content is not null
  when 'repair_response' then deal_id is not null and lead_id is null and vendor_id is null and listing_key is null and cma_id is null and content is not null
  when 'call_followup' then (lead_id is null) <> (deal_id is null) and vendor_id is null and listing_key is null and cma_id is null
  when 'appointment' then (lead_id is null) <> (deal_id is null) and vendor_id is null and listing_key is null and cma_id is null and content is not null
  else lead_id is null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null and content is not null
end);

-- Staff to-dos ------------------------------------------------------------------------------------

create table public.staff_todos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'call_notes')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((lead_id is null) <> (deal_id is null)),
  check (done = (done_at is not null))
);

create index staff_todos_lead_idx on public.staff_todos (lead_id) where lead_id is not null;
create index staff_todos_deal_idx on public.staff_todos (deal_id) where deal_id is not null;
create index staff_todos_open_idx on public.staff_todos (due_date) where not done;

alter table public.staff_todos enable row level security;

create policy "staff_todos: staff who work the lead or deal read"
  on public.staff_todos for select to authenticated
  using (public.can_work_draft_target(lead_id, deal_id));
create policy "staff_todos: staff who work the lead or deal add"
  on public.staff_todos for insert to authenticated
  with check (created_by = auth.uid() and public.can_work_draft_target(lead_id, deal_id));
create policy "staff_todos: staff who work the lead or deal change"
  on public.staff_todos for update to authenticated
  using (public.can_work_draft_target(lead_id, deal_id))
  with check (public.can_work_draft_target(lead_id, deal_id));
create policy "staff_todos: staff who work the lead or deal remove"
  on public.staff_todos for delete to authenticated
  using (public.can_work_draft_target(lead_id, deal_id));

revoke all on public.staff_todos from anon, authenticated;
grant select, delete on public.staff_todos to authenticated;
grant insert (lead_id, deal_id, title, due_date, source, created_by) on public.staff_todos to authenticated;
grant update (title, due_date, done, done_at) on public.staff_todos to authenticated;
