import { calculateStandings, fetchScoreboard } from "./_archive.js";
import { supabaseRequest } from "./_supabase.js";

export async function loadLiveStoryFacts(config, storyType) {
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

  return { season, week, facts: { season, week, storyType, standings, draftedTeamGames: games } };
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
