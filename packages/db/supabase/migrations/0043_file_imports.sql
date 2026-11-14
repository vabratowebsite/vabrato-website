-- Integrations PR 2: importing files from Google Drive and Dropbox into a
-- deal (console only; owner answers 2026-11-14).
--
-- Staff who work a deal can import a file from Google Drive (through
-- Google's picker: the console can open only the files picked) or from the
-- console's own Apps/Vabrato folder in Dropbox. The console only reads; the
-- files stay where they are. An imported file becomes a staff-only deal
-- document or fills the receipt form, exactly like an upload.
--
-- external_ref records where an imported file came from ("drive:<file id>"
-- or "dropbox:id:<file id>"), so the same file can't be imported to the same
-- deal twice and the Dropbox list can mark what's already in. A receipt's
-- source (0001 receipt_source: drive, dropbox) must agree with it.
--
-- Two switches, both off: integration_google_drive and integration_dropbox,
-- changed by admins with set_integration_flag (0042, audited).

insert into public.feature_flags (key, description) values
  ('integration_google_drive', 'Google Drive import: staff pick files in Google''s picker (the console can open only those) and import them into a deal''s documents or receipts.'),
  ('integration_dropbox', 'Dropbox import: staff import files from the console''s own Apps/Vabrato folder in Dropbox into a deal''s documents or receipts. The console only reads that folder.')
on conflict (key) do nothing;

-- Deal documents ------------------------------------------------------------------------------------

alter table public.deal_documents
  add column external_ref text check (external_ref is null or external_ref ~ '^(drive:[A-Za-z0-9_-]{5,200}|dropbox:id:[A-Za-z0-9_-]{5,200})$');

create unique index deal_documents_external_ref_idx on public.deal_documents (deal_id, external_ref) where external_ref is not null;

grant insert (external_ref) on public.deal_documents to authenticated;

-- Receipts ------------------------------------------------------------------------------------------

alter table public.receipts
  add column external_ref text check (external_ref is null or external_ref ~ '^(drive:[A-Za-z0-9_-]{5,200}|dropbox:id:[A-Za-z0-9_-]{5,200})$');

-- A manual receipt has no external_ref; an imported one says where it came from, and the two agree.
alter table public.receipts
  add constraint receipts_source_matches_ref check (
    (source = 'manual' and external_ref is null)
    or (source <> 'manual' and external_ref is not null and source::text = split_part(external_ref, ':', 1))
  );

create unique index receipts_external_ref_idx on public.receipts (deal_id, external_ref) where external_ref is not null;
