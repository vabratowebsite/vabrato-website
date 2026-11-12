-- S6b PR 7b: an inspection report's repair items, the contractor bid list
-- and the seller's response to the buyer's request for repairs.
--
-- Two staff features, each behind its own switch (off):
-- - repair items: the assistant reads one inspection report from the deal's
--   documents (inline, under Zero Data Retention, that request only) and
--   lists repair items; the agent edits and approves the list. The bid list
--   is our code, grouped by trade.
-- - the response: the agent decides each item (repair, credit, decline; all
--   start as not requested); our code writes the item list and the fixed
--   lines, the assistant writes only an opening and a closing; the agent
--   approves it, then copies, emails or prints it. Nothing is sent by itself.
--
-- Both are ai_drafts on the deal, so the 0028 policies apply: staff with
-- access to the deal start and change their own; once approved, staff on the
-- deal can read them. Approved drafts are frozen (the 0028/0031 guard) and
-- kept; drafts nobody approves are deleted after 30 days idle (0028 purge).

insert into public.feature_flags (key, description) values
  ('ai_staff_inspection_items', 'VA assistant: reads one inspection report from a deal''s documents and lists the repair items with pages. The agent edits and approves the list; the bid list is grouped by trade from it.'),
  ('ai_staff_repair_response', 'VA assistant: writes the opening and closing of the seller''s response to the buyer''s request for repairs. Our code writes the item list from the agent''s decisions; the agent approves it.')
on conflict (key) do nothing;

alter table public.ai_drafts drop constraint ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in (
  'lead_reply', 'open_house_followup', 'escrow_update', 'vendor_request',
  'listing_kit', 'listing_presentation', 'buyer_presentation',
  'market_update', 'cma_writeup',
  'inspection_items', 'repair_response'));

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
  else lead_id is null and deal_id is null and vendor_id is null and listing_key is null and cma_id is null and content is not null
end);

-- One open (unapproved) items list per inspection report.
create unique index ai_drafts_one_open_items_per_document
  on public.ai_drafts (deal_id, (content->>'document_id'))
  where kind = 'inspection_items' and status = 'draft';
