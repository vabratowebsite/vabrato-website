-- Private buckets. Object path convention: deal/{deal_id}/{filename} — the
-- second path segment is the deal id the policies key off.
-- receipts: staff-only (money-adjacent). deal-docs: anyone with deal access
-- (sellers see their deal's documents).

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false), ('deal-docs', 'deal-docs', false)
on conflict (id) do nothing;

create function public.storage_deal_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(object_name))[1] = 'deal'
      and (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid
    else null
  end;
$$;

create policy "receipts bucket: staff with deal access"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_staff()
    and public.has_deal_access(public.storage_deal_id(name))
  )
  with check (
    bucket_id = 'receipts'
    and public.is_staff()
    and public.has_deal_access(public.storage_deal_id(name))
  );

create policy "deal-docs bucket: deal access"
  on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs' and public.has_deal_access(public.storage_deal_id(name)));

create policy "deal-docs bucket: staff write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deal-docs'
    and public.is_staff()
    and public.has_deal_access(public.storage_deal_id(name))
  );

create policy "deal-docs bucket: staff delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deal-docs'
    and public.is_staff()
    and public.has_deal_access(public.storage_deal_id(name))
  );
