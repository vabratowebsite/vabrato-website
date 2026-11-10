-- Listing photos copied from the feed (MLS_PHOTO_MODE=copy), used only if
-- MLSListings allows copying photos to our storage (SPEC open questions).
-- Public read by URL so listing pages can render them; no storage.objects
-- policies, so API roles cannot list, upload or delete. The sync job (service
-- role) writes objects and deletes them when a listing is removed (MLS-5) or
-- on a purge (MLS-9). Path: listing/{ListingKey}/{MediaKey}.{ext}

insert into storage.buckets (id, name, public)
values ('mls-photos', 'mls-photos', true)
on conflict (id) do nothing;
