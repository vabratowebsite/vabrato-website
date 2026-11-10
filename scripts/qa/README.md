# Site QA (S4)

`s4-qa.mjs` runs, for every public page type:

- axe-core (WCAG 2.0/2.1/2.2 A and AA tags) at 1440 and 390 px;
- a JSON-LD check (valid JSON, `@context`, the required fields per type, no Review/AggregateRating markup);
- full-page screenshots, written to `docs/screenshots/s4/`;
- Lighthouse with the mobile preset on the key pages. The gate is ≥ 90 for performance, accessibility and best practices. SEO is reported but not gated: every page is noindex until launch (S9), and that alone costs the SEO score.

It exits 1 if any page fails. `report.json` lands next to the screenshots.

## Setup (once)

The tools aren't repo dependencies. Install them in any folder:

```bash
npm i --prefix ~/qa-tools lighthouse@12.2.1 @axe-core/playwright@4.10.1 axe-core@4.10.2 playwright
```

## Run against a local production build

```bash
pnpm --filter @vabrato/web build && pnpm --filter @vabrato/web start
```

```bash
QA_TOOLS=~/qa-tools node scripts/qa/s4-qa.mjs --base http://localhost:3003
```

Optional flags:

- `--chrome /path/to/chromium` uses a specific browser.
- `--no-lighthouse` skips Lighthouse.
- `--scl-base http://homes.sancarloslife.com:3003 --scl-ip 127.0.0.1` adds the homes.sancarloslife.com pages. This only works when `site_scl_enabled` is on in that database.

The page list uses the fictional fixture keys (FX-001 and so on). So run it against a database loaded with the preview seed (`packages/mls/src/jobs/seed-preview.ts`), never against live MLS data.

## How the S4 run was made

The cloud session that built S4 couldn't reach the hosted Supabase project or `*.vercel.app`. So the run used a local stack:

- Postgres 16, loaded with the PGlite harness's Supabase shim (`packages/db/test/harness.ts`), every migration, and the preview seed (`--public-only --publish-placeholders`);
- PostgREST v12 in front of it;
- a small proxy that maps `/rest/v1` to PostgREST, so supabase-js works unchanged.

The web app was built with `NEXT_PUBLIC_SUPABASE_URL` pointing at that proxy. Same code and same data as the preview; only the database host differs.

To check the Vercel preview itself, run the same command with `--base <preview URL>` from a machine that can reach it. The URL needs a protection-bypass token if Deployment Protection is on.
