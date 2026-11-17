-- AI test mode: the listing features while every MLS row is fictional
-- (owner answers 2026-11-17).
--
-- 0044 kept every feature that sends MLS data out of test mode, because
-- MLSListings must approve AI on their data first. Before the real MLS sync
-- starts, every listing, agent and office in the database is fictional
-- (source = 'mock', loaded by packages/mls seed-preview), so those features
-- can't send any MLS data to the model. Testers can now try them:
--
--   console: listing launch kit, presentations, market update, CMA write-up
--   website: compare homes, ask about a home, tour-day plan
--
-- They stop on their own, with no switch to remember, as soon as one real row
-- exists in mls_listings, mls_members or mls_offices (the sync writes
-- source = 'MLSListings', the column default). Media, open houses, price
-- events and the VOW/FULL tables hang off a listing, so checking listings
-- covers them. Everything else about test mode is unchanged: named testers
-- only, the per-feature switches ignored, and nothing changes once
-- ai_enabled is on.
--
-- ai_refusal, ai_begin and ai_features_available all ask ai_test_scope, so
-- the console, the website and packages/ai follow without code changes.

-- True while no MLS row in the database came from MLSListings.
create function public.mls_all_fictional()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from mls_listings where source <> 'mock')
     and not exists (select 1 from mls_members where source <> 'mock')
     and not exists (select 1 from mls_offices where source <> 'mock');
$$;

create or replace function public.ai_test_scope(p_feature text, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_deal is not null then
      p_feature = any (array[
        'staff_document_check', 'staff_counter_changes', 'staff_receipt_reader', 'staff_inspection_items',
        'staff_repair_response', 'staff_escrow_update', 'staff_vendor_request', 'staff_call_notes', 'staff_appointments',
        'member_summarize', 'member_draft', 'member_cover_letter'
      ])
      and coalesce((select d.is_test from deals d where d.id = p_deal), false)
    else p_feature = any (array[
      -- The tester's own upload at deal intake.
      'staff_contract_reader',
      -- The member's own typed text, own uploads and own plans.
      'member_explain', 'member_search', 'member_summarize', 'member_draft', 'member_cover_letter',
      'member_moving', 'member_prelisting', 'member_palette', 'member_staging', 'member_flyer'
    ])
    or (
      -- Listing data, only while all of it is fictional.
      p_feature = any (array[
        'staff_listing_kit', 'staff_presentations', 'staff_market_update', 'staff_cma_writeup',
        'member_compare', 'member_listing', 'member_tour'
      ])
      and public.mls_all_fictional()
    )
  end;
$$;

update public.feature_flags
   set description = 'AI test mode before Zero Data Retention: named testers only, on test deals and their own typed text or uploads, plus the listing features while every MLS listing is fictional. Real client records never reach the model. Ignored once ai_enabled is on.'
 where key = 'ai_test_mode';

revoke execute on function public.mls_all_fictional() from public, anon, authenticated;
revoke execute on function public.ai_test_scope(text, uuid) from public, anon, authenticated;
