-- S6b PR 5: listing launch kits and printable presentations.
--
-- Two staff features, each behind its own switch (off): a launch kit for one
-- of our own listings (MLS description, social posts, email blast, flyer),
-- and listing and buyer presentations to print. Both are drafts in
-- ai_drafts (0028): the agent who asked edits and approves them; the console
-- never publishes or sends them. Structured parts live in `content`; `body`
-- keeps a plain-text copy for lists and copying.

insert into public.feature_flags (key, description) values
  ('ai_staff_listing_kit', 'VA assistant: a launch kit for one of our own listings (MLS description, social posts, email blast, printable flyer). The agent edits and approves it, then copies or prints it.'),
  ('ai_staff_presentations', 'VA assistant: listing and buyer presentations as printable pages, written with the agent''s profile and Vabrato''s timeline. The agent edits and approves them before printing.')
on conflict (key) do nothing;

alter table public.ai_drafts
  add column listing_key text references public.mls_listings (listing_key) on delete cascade,
  add column content jsonb check (content is null or (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 32768));

create index ai_drafts_listing_idx on public.ai_drafts (listing_key) where listing_key is not null;

alter table public.ai_drafts drop constraint ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in (
  'lead_reply', 'open_house_followup', 'escrow_update', 'vendor_request',
  'listing_kit', 'listing_presentation', 'buyer_presentation'));

-- Each kind points at what it's about, and only that.
alter table public.ai_drafts drop constraint ai_drafts_check;
alter table public.ai_drafts add constraint ai_drafts_check check (case kind
  when 'lead_reply' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null
  when 'open_house_followup' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null
  when 'escrow_update' then deal_id is not null and lead_id is null and vendor_id is null and listing_key is null
  when 'vendor_request' then deal_id is not null and vendor_id is not null and lead_id is null and listing_key is null
  when 'listing_kit' then listing_key is not null and lead_id is null and deal_id is null and vendor_id is null and content is not null
  else lead_id is null and deal_id is null and vendor_id is null and listing_key is null and content is not null
end);

alter table public.ai_drafts drop constraint ai_drafts_sent_via_check;
alter table public.ai_drafts add constraint ai_drafts_sent_via_check check (sent_via in ('email', 'copy', 'portal', 'print'));

-- Kits and presentations belong to the staff member who asked; a kit only
-- for one of our own listings. Approved ones are readable by admins too.
-- (The lead and deal draft policies from 0028 don't apply to these kinds:
-- they need a lead or a deal.)
create policy "ai_drafts: owner reads own kits and presentations"
  on public.ai_drafts for select to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation') and owner_id = auth.uid() and public.is_staff());
create policy "ai_drafts: admins read approved kits and presentations"
  on public.ai_drafts for select to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation') and status = 'approved' and public.is_admin());
create policy "ai_drafts: staff start kits for our listings and presentations"
  on public.ai_drafts for insert to authenticated
  with check (
    kind in ('listing_kit', 'listing_presentation', 'buyer_presentation') and owner_id = auth.uid() and status = 'draft' and public.is_staff()
    and (kind <> 'listing_kit' or exists (select 1 from mls_listings l where l.listing_key = ai_drafts.listing_key and l.is_own_listing))
  );
create policy "ai_drafts: owner changes own kits and presentations"
  on public.ai_drafts for update to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation') and owner_id = auth.uid() and public.is_staff())
  with check (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation') and owner_id = auth.uid() and public.is_staff());

grant insert (kind, lead_id, deal_id, vendor_id, listing_key, subject, body, content) on public.ai_drafts to authenticated;
grant update (subject, body, content, status, sent_via) on public.ai_drafts to authenticated;

-- 0028's guard, now also freezing the structured content and the listing.
create or replace function public.ai_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind
     or new.lead_id is distinct from old.lead_id or new.deal_id is distinct from old.deal_id
     or new.vendor_id is distinct from old.vendor_id or new.listing_key is distinct from old.listing_key
     or new.created_at is distinct from old.created_at then
    raise exception 'draft_fixed_fields' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.subject is distinct from old.subject or new.body is distinct from old.body or new.content is distinct from old.content) then
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

revoke execute on function public.ai_drafts_guard() from public, anon, authenticated;
