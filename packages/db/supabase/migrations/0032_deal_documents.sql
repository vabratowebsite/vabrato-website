-- S6b PR 7a: deal documents, the seller-type checklist, document check and
-- receipt reader.
--
-- Until now the console had no Documents screen, and everything in
-- deal-docs/deal/{id}/ showed in the seller's portal. From here, files staff
-- upload sit in deal/{id}/staff/ (staff with deal access only) until someone
-- shares one, which moves it to deal/{id}/ (the seller's view, as before;
-- owner decision 2026-11-12). The seller reads only files directly in
-- deal/{id}/ (an allowlist; owner review 2026-11-13). deal_documents records each file and the
-- checklist items it covers; the checklist itself lives in code
-- (packages/lib deal-documents.ts). The sellers' own uploads
-- (member_documents) can be tagged too, and "not needed" marks close items
-- that don't apply. The two assistant features have their own switches, off.

insert into public.feature_flags (key, description) values
  ('ai_staff_document_check', 'VA assistant: reads one of a deal''s documents and suggests which checklist items it covers, whether it''s signed, and blanks or missing initials with pages. A person saves the types.'),
  ('ai_staff_receipt_reader', 'VA assistant: reads a receipt into vendor, amount, date and a category. A person checks and saves it.')
on conflict (key) do nothing;

-- Checklist keys come from code: short snake_case words, at most 20 per file.
create function public.valid_doc_types(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(array_length(p, 1), 0) <= 20
     and not exists (select 1 from unnest(p) k where k !~ '^[a-z][a-z0-9_]{1,39}$');
$$;

-- Files in deal-docs ----------------------------------------------------------------------------

create table public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg')),
  doc_types text[] not null default '{}' check (public.valid_doc_types(doc_types)),
  shared boolean not null default false,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An allowlist of exactly two places (case-sensitive): directly in the
  -- deal's folder, which the seller sees (shared), or in its staff/ folder
  -- (not shared). Anything else is rejected.
  check (
    (shared and path ~ ('^deal/' || deal_id::text || '/[^/]{1,240}$'))
    or (not shared and path ~ ('^deal/' || deal_id::text || '/staff/[^/]{1,240}$'))
  )
);

create index deal_documents_deal_idx on public.deal_documents (deal_id, created_at desc);

create trigger deal_documents_updated_at
  before update on public.deal_documents
  for each row execute function public.set_updated_at();

alter table public.deal_documents enable row level security;

create policy "deal_documents: staff with deal access read"
  on public.deal_documents for select to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));
create policy "deal_documents: staff with deal access add"
  on public.deal_documents for insert to authenticated
  with check (public.is_staff() and public.has_deal_access(deal_id) and uploaded_by = auth.uid());
create policy "deal_documents: staff with deal access change"
  on public.deal_documents for update to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id))
  with check (public.is_staff() and public.has_deal_access(deal_id));
create policy "deal_documents: staff with deal access remove"
  on public.deal_documents for delete to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));

revoke all on public.deal_documents from anon, authenticated;
grant select, delete on public.deal_documents to authenticated;
grant insert (deal_id, path, file_name, size_bytes, content_type, doc_types, shared, uploaded_by) on public.deal_documents to authenticated;
grant update (path, doc_types, shared) on public.deal_documents to authenticated;

-- The sellers' own uploads, tagged for a deal ------------------------------------------------------

create table public.deal_member_document_types (
  deal_id uuid not null references public.deals (id) on delete cascade,
  member_document_id uuid not null references public.member_documents (id) on delete cascade,
  doc_types text[] not null default '{}' check (public.valid_doc_types(doc_types)),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (deal_id, member_document_id)
);

create trigger deal_member_document_types_updated_at
  before update on public.deal_member_document_types
  for each row execute function public.set_updated_at();

alter table public.deal_member_document_types enable row level security;

-- Readable member_documents rows are already limited to staff who may see the
-- member (0019); the document must belong to a seller on this deal.
create function public.is_deal_seller_document(p_deal uuid, p_document uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from member_documents md
    join deal_members dm on dm.profile_id = md.profile_id
    where md.id = p_document and dm.deal_id = p_deal and dm.member_role = 'seller'
  );
$$;

create policy "deal_member_document_types: staff with deal access read"
  on public.deal_member_document_types for select to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id) and public.is_deal_seller_document(deal_id, member_document_id));
create policy "deal_member_document_types: staff with deal access add"
  on public.deal_member_document_types for insert to authenticated
  with check (public.is_staff() and public.has_deal_access(deal_id) and public.is_deal_seller_document(deal_id, member_document_id) and updated_by = auth.uid());
create policy "deal_member_document_types: staff with deal access change"
  on public.deal_member_document_types for update to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id) and public.is_deal_seller_document(deal_id, member_document_id))
  with check (public.is_staff() and public.has_deal_access(deal_id) and public.is_deal_seller_document(deal_id, member_document_id));
create policy "deal_member_document_types: staff with deal access remove"
  on public.deal_member_document_types for delete to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));

revoke all on public.deal_member_document_types from anon, authenticated;
grant select, delete on public.deal_member_document_types to authenticated;
grant insert (deal_id, member_document_id, doc_types, updated_by) on public.deal_member_document_types to authenticated;
grant update (doc_types, updated_by) on public.deal_member_document_types to authenticated;

-- "Not needed" marks -----------------------------------------------------------------------------

create table public.deal_checklist_marks (
  deal_id uuid not null references public.deals (id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  note text check (note is null or length(note) <= 200),
  marked_by uuid default auth.uid() references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (deal_id, item_key)
);

alter table public.deal_checklist_marks enable row level security;

create policy "deal_checklist_marks: staff with deal access read"
  on public.deal_checklist_marks for select to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));
create policy "deal_checklist_marks: staff with deal access add"
  on public.deal_checklist_marks for insert to authenticated
  with check (public.is_staff() and public.has_deal_access(deal_id) and marked_by = auth.uid());
create policy "deal_checklist_marks: staff with deal access remove"
  on public.deal_checklist_marks for delete to authenticated
  using (public.is_staff() and public.has_deal_access(deal_id));

revoke all on public.deal_checklist_marks from anon, authenticated;
grant select, delete on public.deal_checklist_marks to authenticated;
grant insert (deal_id, item_key, note, marked_by) on public.deal_checklist_marks to authenticated;

-- Storage reads as an allowlist ----------------------------------------------------------------------
-- Staff with deal access read everything under deal/{id}/. Anyone else with
-- deal access (the seller) reads only objects directly in deal/{id}/: exactly
-- two folder segments, so staff/, Staff/, tmp/ or deeper are never theirs.

drop policy "deal-docs bucket: deal access" on storage.objects;
create policy "deal-docs bucket: deal access (seller: top level only)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deal-docs'
    and public.has_deal_access(public.storage_deal_id(name))
    and (public.is_staff() or coalesce(array_length(storage.foldername(name), 1), 0) = 2)
  );

-- Audit: sharing, stopping sharing and deleting are written to staff_audit
-- (who, which document, which deal and file name; never content).
create function public.log_deal_document_action(p_deal uuid, p_action text, p_document uuid, p_file text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() and public.has_deal_access(p_deal)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_action not in ('document_shared', 'document_unshared', 'document_deleted', 'unfiled_deleted') then
    raise exception 'bad_action' using errcode = '22023';
  end if;
  insert into staff_audit (actor_id, action, ref_table, ref_id, detail)
  values (auth.uid(), p_action, 'deal_documents', p_document::text,
          jsonb_build_object('deal', p_deal, 'file', left(coalesce(p_file, ''), 200)));
end;
$$;

revoke execute on function public.log_deal_document_action(uuid, text, uuid, text) from public, anon;
grant execute on function public.log_deal_document_action(uuid, text, uuid, text) to authenticated;

revoke execute on function public.valid_doc_types(text[]) from public, anon;
revoke execute on function public.is_deal_seller_document(uuid, uuid) from public, anon;
grant execute on function public.valid_doc_types(text[]) to authenticated;
grant execute on function public.is_deal_seller_document(uuid, uuid) to authenticated;
