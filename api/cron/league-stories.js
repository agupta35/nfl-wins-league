import { fetchScoreboard, calculateStandings } from "../_archive.js";
import { generateNarrative, saveStory } from "../_stories.js";
import { getSupabaseConfig, sendJson, supabaseRequest } from "../_supabase.js";

export default async function handler(request, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  const storyType = storyTypeForToday(new Date());
  if (!storyType) return sendJson(response, 200, { skipped: true, reason: "No scheduled story today" });

  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Supabase is not configured" });

  try {
    const board = await fetchScoreboard();
    const season = Number(board.season?.year);
    const week = Number(board.week?.number);
    if (!Number.isInteger(season) || !Number.isInteger(week)) throw new Error("ESPN did not return season context");

    const [rostersResponse, archivedResponse] = await Promise.all([
      supabaseRequest(config, `/rest/v1/season_rosters?select=owner_name,team_abbreviation&season=eq.${season}`),
      supabaseRequest(config, `/rest/v1/archived_games?select=away_team,home_team,away_score,home_score,completed&season=eq.${season}&completed=eq.true`),
    ]);
    const [rosters, archivedGames] = await Promise.all([rostersResponse.json(), archivedResponse.json()]);
    if (!rosters.length) throw new Error(`No roster is configured for ${season}`);

    const facts = buildStoryFacts(storyType, season, week, board, rosters, archivedGames);
    const narrative = await generateNarrative(config, storyType, facts);
    if (!narrative) return sendJson(response, 200, { generated: false, season, week, storyType });

    await saveStory(config, { season, week, storyType, ...narrative, facts });
    return sendJson(response, 200, { generated: true, season, week, storyType, headline: narrative.headline });
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Story generation failed" });
  }
}

function storyTypeForToday(date) {
  const day = date.getUTCDay();
  if (day === 4) return "week_ahead";
  if (day === 0) return "in_progress";
  return null;
}

function buildStoryFacts(storyType, season, week, board, rosters, archivedGames) {
  const ownerByTeam = new Map(rosters.map((row) => [row.team_abbreviation, row.owner_name]));
  const games = (board.events || [])
    .map((event) => storyGame(event, ownerByTeam))
    .filter((game) => game.owners.length);
  const standings = calculateStandings(rosters, archivedGames).map((entry) => ({
    owner: entry.owner,
    wins: entry.wins,
    losses: entry.losses,
    pointsFor: entry.pointsFor,
    differential: entry.pointsFor - entry.pointsAgainst,
  }));
  return { season, week, storyType, standings, draftedTeamGames: games };
}

function storyGame(event, ownerByTeam) {
  const competition = event.competitions?.[0] || {};
  const teams = (competition.competitors || []).map((competitor) => ({
    team: competitor.team?.abbreviation,
    owner: ownerByTeam.get(competitor.team?.abbreviation) || null,
    score: Number(competitor.score || 0),
    homeAway: competitor.homeAway,
  }));
  const odds = competition.odds?.[0];
  return {
    matchup: event.shortName || event.name,
    status: competition.status?.type?.shortDetail || "Scheduled",
    completed: Boolean(competition.status?.type?.completed),
    teams,
    owners: teams.filter((team) => team.owner).map((team) => `${team.owner}: ${team.team}`),
    moneyline: odds?.moneyline
      ? { away: odds.moneyline.away?.close?.odds ?? null, home: odds.moneyline.home?.close?.odds ?? null }
      : null,
  };
}
