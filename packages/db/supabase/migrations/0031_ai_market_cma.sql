-- S6b PR 6: market updates and CMA write-ups.
--
-- Two staff features, each behind its own switch (off), both on sold data
-- that stays switched off until MLSListings approves (market_stats_enabled,
-- cma_enabled). Our code computes every number; the assistant writes the
-- words; the person who asked edits and approves. A market update leaves
-- the console only once public_stats is on (MLS-10), and reaches the
-- website only through Mark's content review (0024). A CMA write-up is for
-- one of the person's CMAs (or any, for an admin).

insert into public.feature_flags (key, description) values
  ('ai_staff_market_update', 'VA assistant: a market update written around the console''s computed market statistics for a city and period. Internal until public_stats is on; then copied or sent to Mark''s website review.'),
  ('ai_staff_cma_writeup', 'VA assistant: a plain-language summary of a CMA around its computed range and comparable sales. A comparison of recent sales, not an appraisal.')
on conflict (key) do nothing;

alter table public.ai_drafts
  add column cma_id uuid references public.cmas (id) on delete cascade;

create index ai_drafts_cma_idx on public.ai_drafts (cma_id) where cma_id is not null;

alter table public.ai_drafts drop constraint ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in (
  'lead_reply', 'open_house_followup', 'escrow_update', 'vendor_request',
  'listing_kit', 'listing_presentation', 'buyer_presentation',
  'market_update', 'cma_writeup'));

-- Each kind points at what it's about, and only that.
alter table public.ai_drafts drop constraint ai_drafts_check;
alter table public.ai_drafts add constraint ai_drafts_check check (case kind
  when 'lead_reply' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'open_house_followup' then lead_id is not null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'escrow_update' then deal_id is not null and lead_id is null and vendor_id is null and listing_key is null and cma_id is null
  when 'vendor_request' then deal_id is not null and vendor_id is not null and lead_id is null and listing_key is null and cma_id is null
  when 'listing_kit' then listing_key is not null and lead_id is null and deal_id is null and vendor_id is null and cma_id is null and content is not null
  when 'cma_writeup' then cma_id is not null and lead_id is null and deal_id is null and vendor_id is null and listing_key is null and content is not null
  else lead_id is null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null and content is not null
end);

alter table public.ai_drafts drop constraint ai_drafts_sent_via_check;
alter table public.ai_drafts add constraint ai_drafts_sent_via_check check (sent_via in ('email', 'copy', 'portal', 'print', 'website'));

-- The 0030 policies, now also covering market updates and CMA write-ups
-- ("kits" here means launch kits and presentations).
drop policy "ai_drafts: owner reads own kits and presentations" on public.ai_drafts;
drop policy "ai_drafts: admins read approved kits and presentations" on public.ai_drafts;
drop policy "ai_drafts: staff start kits for our listings and presentations" on public.ai_drafts;
drop policy "ai_drafts: owner changes own kits and presentations" on public.ai_drafts;

create policy "ai_drafts: owner reads own kits and write-ups"
  on public.ai_drafts for select to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation', 'market_update', 'cma_writeup') and owner_id = auth.uid() and public.is_staff());
create policy "ai_drafts: admins read approved kits and write-ups"
  on public.ai_drafts for select to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation', 'market_update', 'cma_writeup') and status = 'approved' and public.is_admin());
create policy "ai_drafts: staff start kits and write-ups"
  on public.ai_drafts for insert to authenticated
  with check (
    kind in ('listing_kit', 'listing_presentation', 'buyer_presentation', 'market_update', 'cma_writeup') and owner_id = auth.uid() and status = 'draft' and public.is_staff()
    and (kind <> 'listing_kit' or exists (select 1 from mls_listings l where l.listing_key = ai_drafts.listing_key and l.is_own_listing))
    and (kind <> 'market_update' or public.flag_enabled('market_stats_enabled'))
    and (kind <> 'cma_writeup' or (public.flag_enabled('cma_enabled')
         and exists (select 1 from cmas c where c.id = ai_drafts.cma_id and (c.created_by = auth.uid() or public.is_admin()))))
  );
create policy "ai_drafts: owner changes own kits and write-ups"
  on public.ai_drafts for update to authenticated
  using (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation', 'market_update', 'cma_writeup') and owner_id = auth.uid() and public.is_staff())
  with check (kind in ('listing_kit', 'listing_presentation', 'buyer_presentation', 'market_update', 'cma_writeup') and owner_id = auth.uid() and public.is_staff());

grant insert (kind, lead_id, deal_id, vendor_id, listing_key, cma_id, subject, body, content) on public.ai_drafts to authenticated;

-- 0030's guard, now also fixing the CMA a write-up is about.
create or replace function public.ai_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind
     or new.lead_id is distinct from old.lead_id or new.deal_id is distinct from old.deal_id
     or new.vendor_id is distinct from old.vendor_id or new.listing_key is distinct from old.listing_key
     or new.cma_id is distinct from old.cma_id or new.created_at is distinct from old.created_at then
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
