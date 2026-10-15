# NFL Wins Pool Arena

A live scoreboard for a five-player NFL wins pool. Each owner has six NFL teams.

## What It Tracks

- Each drafted NFL team win counts as one league win.
- Leaderboard order is wins, then total regular-season points scored.
- Live games and weekly owner summaries.
- Head-to-head wins when one owner's drafted team beats another owner's drafted team.
- Supabase-backed seasonal rosters, with a local fallback when the database is unavailable.
- Projected standings from the available moneyline odds.
- Official weekly snapshots and recap records after games are archived.

## League Rules

- Regular season only. ESPN requests use regular-season type `2`.
- Every drafted NFL team win has equal weight.
- Total regular-season points scored is the only tiebreaker.
- Head to Head counts only games where drafted teams belonging to two different owners play each other.

## Data Source

The app polls ESPN's public NFL scoreboard endpoint:

```txt
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

No API key is required. Because this is an unofficial public endpoint, the app caches scores in the browser if the feed is temporarily unavailable.

## Run Locally

Run the local server:

```bash
npm run dev
```

Then visit:

```txt
http://localhost:5173
```

The local server proxies `/api/scoreboard` to ESPN so browser CORS does not block live updates.

## Vercel

The production app is deployed at:

```txt
https://nfl-wins-league.vercel.app
```

Vercel serves the `/api/scoreboard` proxy from `api/scoreboard.js`. ESPN remains the live score source, while Supabase stores the roster, archived final scores, weekly snapshots, and recaps.

### Weekly Archive

`vercel.json` schedules `/api/cron/archive-week` each Tuesday at `09:00 UTC`. It backfills final games, creates a standings snapshot for every completed week, and publishes the weekly recap. The job requires `CRON_SECRET`.

On Vercel Hobby, this once-weekly schedule is within the one-run-per-day cron limit. The live scoreboard remains browser-polled and does not depend on the cron.

## Supabase Roster History

The migrations store the regular-season roster for each year, final game archive, weekly standings snapshots, public recaps, and the administrator allowlist. The first administrator is seeded only after a verified Google sign-in, using the private `INITIAL_ADMIN_EMAIL` environment variable.

### Required Environment Variables

Set these in Vercel and keep them out of Git:

```txt
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<public-publishable-key>
SUPABASE_SECRET_KEY=<server-only-secret-key>
CRON_SECRET=<random-16-plus-character-secret>
INITIAL_ADMIN_EMAIL=<initial Google administrator email>
```

The Supabase-Vercel integration supplies the first three variables. Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are also supported for compatibility.

### Google Admin Sign-In

Enable Google in Supabase Auth and add the Google client credentials there. In Google Cloud, the authorized redirect URI is:

```txt
https://<project-ref>.supabase.co/auth/v1/callback
```

In Supabase Auth URL Configuration, add the Vercel deployment URL now and the custom domain when it is purchased. The app uses Google for administrator sign-in and then checks the `league_admins` allowlist before showing roster and archive controls.
