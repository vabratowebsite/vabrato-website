# S4 content checklist

Everything on the public site that's still a placeholder, and what Vabrato needs to supply. Nothing here blocks the build. All of it blocks launch (S9).

`content_launch_blockers()` (staff only) lists any published row still marked `is_placeholder`. A database test also fails if a migration seeds a published placeholder.

## Legal and licensing (needs owner or counsel sign-off)

| Item | Where it shows | Where it lives |
|---|---|---|
| Office phone (now `(650) 555-0100`, a fictional number) | Every footer | `apps/web/src/lib/org.ts` → `ORG.phones` |
| CSLB contractor license number, and whose license it is | `/transform` | `apps/web/src/lib/org.ts` → `CSLB_LICENSE` |
| Viv Kelvin's DRE license number | `/team/viv-kelvin` | `agent_profiles.license_number` |
| Privacy notice (forms, use, 24-month retention, rights) | `/privacy`, linked from every form | `apps/web/src/app/(site)/privacy/page.tsx` |
| Terms of use (incl. the MLS data-use clause) | `/terms` | `apps/web/src/app/(site)/terms/page.tsx` |
| Accessibility statement and contact | `/accessibility` | `apps/web/src/app/(site)/accessibility/page.tsx` |
| Call/text consent wording on forms | Every lead form | `apps/web/src/components/forms/LeadForm.tsx` |

## From MLSListings

| Item | Where it shows | Where it lives |
|---|---|---|
| Official IDX logo or icon | Other brokers' listing cards and details (MLS-2) | `apps/web/src/lib/mls-legal.ts` |
| Official IDX disclaimer text | Every page with listing data (MLS-1) | `apps/web/src/lib/mls-legal.ts` (one file; set `MLS_LEGAL_IS_PLACEHOLDER = false`) |

## Brand

| Item | Where it lives |
|---|---|
| Logo file (SVG preferred). The header and footer show a text wordmark until then. | `Logo` `src` prop in `packages/ui/src/web/site/Logo.tsx` |
| Favicon. Today's is a placeholder made from the gold rays. | `apps/web/src/app/icon.svg` |
| Team photo, and a video still for "Meet Vabrato" | Home page (`apps/web/src/app/(site)/page.tsx`) |
| "Meet Vabrato" YouTube video ID | Home page (the link is currently youtube.com) |

## Copy (from today's vabrato.com, or new)

| Item | Where it lives |
|---|---|
| Home: welcome, Meet Vabrato, transform blurb, five FAQ answers | `apps/web/src/lib/home-content.ts` |
| About page story and values | `apps/web/src/app/(site)/about/page.tsx` |
| Buy page (buyer services) | `apps/web/src/app/(site)/buy/page.tsx` |
| Sell page (seller services) | `apps/web/src/app/(site)/sell/page.tsx` |
| Transform page: service copy, plus project titles and before/after photos | `apps/web/src/app/(site)/transform/page.tsx` |

## Content tables (edit in Supabase until the S6 editor; set `is_placeholder = false` when real)

| Table | Needed |
|---|---|
| `agent_profiles` | Mark and Viv: bio, photo, business phone and email, MLS member ID (for "their listings"), start year, skills, outlook, history, video ID, FAQ, social links |
| `city_guides` | San Carlos guide: intro, neighborhoods, official school-district links, FAQ. Other cities as written. Cities without a guide already show listings and a templated FAQ. |
| `testimonials` | Real client reviews, with permission. Seeded unpublished. No star-rating markup is emitted (review item 15). |
| `posts` | Insights and news articles in Markdown (two placeholders are published on the preview only) |
| `videos` | YouTube IDs and titles for "Latest videos" (the section hides while empty) |

## Before launch, not content

- Remove the preview fixtures: `pnpm --filter @vabrato/mls sync purge --mock --confirm`.
- Unpublish the placeholder rows that `seed-preview --publish-placeholders` published on the preview project.
- Set `NEXT_PUBLIC_MAPBOX_TOKEN` (search is list-only without it), `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `LEAD_IP_SALT` and `REVALIDATE_SECRET` in Vercel.
- homes.sancarloslife.com: DNS in Cloudflare, add the domain to the Vercel project, then turn on `site_scl_enabled`.
