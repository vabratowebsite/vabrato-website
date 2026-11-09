-- Hardening from the Supabase security advisor (S1, 2026-11-09).
--
-- 1. Pin search_path on the two functions that lacked it.
-- 2. handle_new_user is a trigger function: nobody should call it via RPC.
-- 3. The RLS helpers only answer questions about the caller (auth.uid()), but
--    signed-out visitors have no reason to call them. Keep EXECUTE for
--    `authenticated` because RLS policies evaluate them as that role.

alter function public.set_updated_at() set search_path = public;
alter function public.storage_deal_id(text) set search_path = public, storage;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.has_deal_access(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.has_deal_access(uuid) to authenticated;
