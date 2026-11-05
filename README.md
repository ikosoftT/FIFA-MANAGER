# 1337 FIFA Tournament Manager

This Next.js application manages the supplied 58-player, 57-match single-elimination tournament using Supabase PostgreSQL as its authoritative shared data source.

Public visitors can read the tournament without signing in. The /admin workspace requires a Supabase email/password session and membership in the private administrator allowlist. Every mutation rechecks authorization on the server and inside its PostgreSQL function.

## Local development

Requirements:

- Node.js 20.9 or newer
- A Supabase project

Copy .env.example to .env.local and provide:

    NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY

The publishable key is intended for browser use and is constrained by Row Level Security. Never put a secret or service-role key in a NEXT_PUBLIC variable.

Install and run:

    npm install
    npm run dev

Quality commands:

    npm run typecheck
    npm run lint
    npm test
    npm run build

## Database setup

The remote project must be initialized before the site can load tournament data. In the Supabase SQL Editor, execute these files in order:

1. supabase/migrations/202611050001_schema_and_security.sql
2. supabase/migrations/202611050002_atomic_tournament_rpcs.sql
3. supabase/migrations/202611050003_legacy_import.sql
4. supabase/seed.sql

The seed is idempotent: rerunning it does not overwrite results, schedules, replacements, or settings.

The migrations create:

- tournaments, players, matches, and match_events
- the private administrator allowlist
- public read-only RLS policies
- administrator-only transactional RPC functions
- scheduling conflict, bracket advancement, correction, replacement, and walkover checks

## Create the administrator

1. Open Supabase Dashboard → Authentication → Users.
2. Add the organizer with email and password.
3. Copy that user's UUID.
4. In Authentication settings, disable public user sign-ups.
5. Run this in SQL Editor, replacing the placeholder:

    insert into private.admin_users(user_id)
    values ('YOUR-AUTH-USER-UUID')
    on conflict do nothing;

Do not add a public sign-up page. The application only contains sign-in and logout flows. The private allowlist cannot be read through the public Data API.

The login page is /admin/login.

## Existing localStorage migration

Legacy browser state is never imported automatically.

1. Sign in as the administrator using the same browser that contains the old data.
2. Open Admin → Settings.
3. Export the current Supabase state as a safety backup.
4. Choose Inspect legacy localStorage, or upload a previously exported JSON file.
5. Review the player, match, and completed-result counts.
6. Confirm the atomic import.

The client validates schema, references, bracket topology, winner advancement, active-player uniqueness, and champion consistency. PostgreSQL validates the bracket counts again, imports everything in one transaction, records an audit event, and rejects duplicate imports.

After a successful migration, localStorage is retained only as a legacy source for that explicit workflow. It is never read as authoritative tournament state.

## Runtime behavior

- Public state is fetched from /api/tournament with no-store caching.
- Active pages refresh from Supabase every 20 seconds.
- Successful mutations return confirmed database state and revalidate public/admin routes.
- Scheduling input is interpreted in Africa/Casablanca and stored as TIMESTAMPTZ.
- Result recording, advancement, corrections, walkovers, and replacements are atomic PostgreSQL functions.
- Direct anonymous and authenticated table writes are revoked; only authorized RPC calls can mutate data.

## Vercel deployment

1. Import the Git repository into Vercel.
2. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for Production and Preview.
3. Ensure the SQL migrations, seed, Auth user, and allowlist entry have already been applied.
4. Deploy with the standard Next.js build command.
5. Add the Vercel production URL to Supabase Authentication → URL Configuration.

No service-role key, persistent filesystem, or localStorage-based production state is required.

## Regenerating the seed

If the bundled initial tournament topology intentionally changes, regenerate the SQL with:

    npx tsx scripts/generate-seed.ts

Do not regenerate or reapply changed seed data after live tournament progress without reviewing the resulting SQL.
