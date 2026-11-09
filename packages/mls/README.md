# @vabrato/mls

MLSListings data for Vabrato, through the RESO Web API. See `docs/SPEC.md` (`<mls_data>`, MLS-1 to MLS-10, ACC-1/ACC-2).

Planned contents (segment S3):

- `client/`: RESO Web API client (Property, Media, OpenHouse, Member, Office)
- `mock/`: mock server used until credentials arrive
- `fixtures/`: **fictional** records using RESO Data Dictionary field names
- `sync/`: incremental sync every 15 min by `ModificationTimestamp`, nightly full reconcile; runs on Render, never inside a Vercel request
- `levels/`: field allowlists per data level (IDX, VOW, FULL)

Rules for this package:

- The repo is public. Never commit MLS credentials or real MLS data (listings, exports, photos).
- Credentials come only from environment variables; see `src/config.ts`.
