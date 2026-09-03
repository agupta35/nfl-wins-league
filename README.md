# NFL Wins Pool Arena

A static live scoreboard for an NFL wins pool.

## What It Tracks

- Owner leaderboard by drafted-team wins.
- Points scored as the tiebreaker.
- Live games and weekly owner summaries.
- Head-to-head wins when one owner's drafted team beats another owner's drafted team.
- Editable draft board saved in browser localStorage.

## Data Source

The app polls ESPN's public NFL scoreboard endpoint:

```txt
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

No API key is required. Because this is an unofficial public endpoint, the UI keeps the draft editable and can keep showing cached scores if the feed fails.

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

## Cloudflare Pages

Use these settings:

- Build command: leave blank
- Build output directory: `.`
- Functions directory: `functions`

The production `/api/scoreboard` endpoint is implemented in `functions/api/scoreboard.js`.
