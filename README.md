# NFL Wins Pool Arena

A live scoreboard for a five-player NFL wins pool. Each owner has six NFL teams.

## What It Tracks

- Each drafted NFL team win counts as one league win.
- Leaderboard order is wins, then total regular-season points scored.
- Live games and weekly owner summaries.
- Head-to-head wins when one owner's drafted team beats another owner's drafted team.
- Fixed imported draft for Carlton, A-Rod, Logan, Jared, and Ash.
- Year-to-year results for 2024, 2025, and 2026 using the same confirmed roster.

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

Vercel serves the `/api/scoreboard` proxy from `api/scoreboard.js`. ESPN remains the live score source, while Supabase stores the season roster history.

## Supabase Roster History

The migration in `supabase/migrations/202609030001_create_season_rosters.sql` stores the regular-season roster for each year. It seeds the confirmed five-owner roster for 2024, 2025, and 2026. Future drafts should be added as a new season roster before the regular season begins.
