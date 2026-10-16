import { generateSeasonStory, generateWeeklyRecapNarrative, saveStory } from "./_stories.js";
import { loadEditorialBrief, refreshLeagueIntelligence } from "./_intelligence.js";
import { supabaseRequest } from "./_supabase.js";

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const WEEKS = Array.from({ length: 18 }, (_, index) => index + 1);

export async function archiveCurrentSeason(config, { includeAiNarrative = false } = {}) {
  const currentBoard = await fetchScoreboard();
  const season = Number(currentBoard.season?.year);
  if (!Number.isInteger(season)) throw new Error("ESPN did not return a season");

  const [rostersResponse, boards] = await Promise.all([
    supabaseRequest(config, `/rest/v1/season_rosters?select=owner_name,team_abbreviation&season=eq.${season}`),
    Promise.all(WEEKS.map((week) => fetchScoreboard(week, season))),
  ]);
  const rosters = await rostersResponse.json();
  if (!rosters.length) throw new Error(`No roster is configured for ${season}`);

  const ownerByTeam = new Map(rosters.map((row) => [row.team_abbreviation, row.owner_name]));
  const finalGames = boards.flatMap((board, index) =>
    (board.events || [])
      .map((event) => normalizeArchivedGame(event, season, index + 1))
      .filter((game) => game?.completed && (ownerByTeam.has(game.away_team) || ownerByTeam.has(game.home_team))),
  );
  if (!finalGames.length) return { season, archivedGames: 0, snapshotWeek: null };

  const snapshotWeek = Math.max(...finalGames.map((game) => game.week));
  await supabaseRequest(config, "/rest/v1/archived_games?on_conflict=event_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(finalGames),
  });

  const archivedResponse = await supabaseRequest(
    config,
    `/rest/v1/archived_games?select=season,week,away_team,home_team,away_score,home_score,completed&season=eq.${season}&completed=eq.true`,
  );
  const archivedGames = await archivedResponse.json();
  const completedWeeks = [...new Set(archivedGames.map((game) => game.week))].sort((a, b) => a - b);
  const snapshots = completedWeeks.flatMap((week) => {
    const standings = calculateStandings(rosters, archivedGames.filter((game) => game.week <= week));
    return standings.map((entry, index) => ({
      season,
      week,
      owner_name: entry.owner,
      wins: entry.wins,
      losses: entry.losses,
      ties: entry.ties,
      points_for: entry.pointsFor,
      points_against: entry.pointsAgainst,
      rank: index + 1,
      captured_at: new Date().toISOString(),
    }));
  });
  await supabaseRequest(config, "/rest/v1/weekly_standings_snapshots?on_conflict=season,week,owner_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(snapshots),
  });

  const weeklyResults = new Map(
    completedWeeks.map((week) => [week, buildWeeklyResults(rosters, archivedGames.filter((game) => game.week === week))]),
  );
  const recaps = completedWeeks.map((week, index) =>
    buildRecap(
      season,
      week,
      weeklyResults.get(week),
      calculateStandings(rosters, archivedGames.filter((game) => game.week <= week)),
      completedWeeks.slice(0, index + 1).map((priorWeek) => weeklyResults.get(priorWeek)),
    ),
  );
  const existingRecapsResponse = await supabaseRequest(
    config,
    `/rest/v1/weekly_recaps?select=week,recap_data&season=eq.${season}`,
  );
  const existingRecaps = await existingRecapsResponse.json();
  const existingNarratives = new Map(
    existingRecaps.map((recap) => [recap.week, recap.recap_data?.aiNarrative]).filter(([, narrative]) => narrative),
  );
  recaps.forEach((recap) => {
    const previousNarrative = existingNarratives.get(recap.week);
    if (previousNarrative) recap.recap_data.aiNarrative = previousNarrative;
  });

  await refreshLeagueIntelligence(config, season, recaps);

  if (includeAiNarrative && recaps.length) {
    const latestRecap = recaps.at(-1);
    const editorialBrief = await loadEditorialBrief(config, season, latestRecap.week);
    const narrative = await generateWeeklyRecapNarrative(config, latestRecap, { editorialBrief });
    if (narrative) latestRecap.recap_data.aiNarrative = narrative;

    const seasonNarrative = await generateSeasonStory(config, season, latestRecap.week, latestRecap.recap_data.standings, { editorialBrief });
    if (seasonNarrative) {
      await saveStory(config, {
        season,
        week: latestRecap.week,
        storyType: "season",
        ...seasonNarrative,
        facts: { standings: latestRecap.recap_data.standings, week: latestRecap.week },
      });
    }
  }

  await supabaseRequest(config, "/rest/v1/weekly_recaps?on_conflict=season,week", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(recaps),
  });

  return { season, archivedGames: finalGames.length, snapshotWeek, recap: recaps.at(-1)?.title };
}

export async function fetchScoreboard(week, season) {
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set("seasontype", "2");
  if (week) {
    url.searchParams.set("week", String(week));
    url.searchParams.set("dates", String(season));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ESPN ${response.status}`);
  return response.json();
}

function normalizeArchivedGame(event, season, week) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const away = competitors.find((team) => team.homeAway === "away");
  const home = competitors.find((team) => team.homeAway === "home");
  if (!away?.team?.abbreviation || !home?.team?.abbreviation || !event.id) return null;
  return {
    event_id: String(event.id),
    season,
    week,
    scheduled_at: event.date,
    away_team: away.team.abbreviation,
    home_team: home.team.abbreviation,
    away_score: Number(away.score || 0),
    home_score: Number(home.score || 0),
    completed: Boolean(competition.status?.type?.completed),
    source_updated_at: new Date().toISOString(),
  };
}

export function calculateStandings(rosters, games) {
  const ownerByTeam = new Map(rosters.map((row) => [row.team_abbreviation, row.owner_name]));
  const rows = Array.from(new Set(rosters.map((row) => row.owner_name))).map((owner) => ({
    owner,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }));
  const byOwner = new Map(rows.map((row) => [row.owner, row]));

  games.forEach((game) => {
    const teams = [
      { abbrev: game.away_team, score: game.away_score, opponentScore: game.home_score },
      { abbrev: game.home_team, score: game.home_score, opponentScore: game.away_score },
    ];
    teams.forEach((team) => {
      const owner = ownerByTeam.get(team.abbrev);
      if (!owner) return;
      const row = byOwner.get(owner);
      row.pointsFor += team.score;
      row.pointsAgainst += team.opponentScore;
      if (team.score > team.opponentScore) row.wins += 1;
      if (team.score < team.opponentScore) row.losses += 1;
      if (team.score === team.opponentScore) row.ties += 1;
    });
  });

  return rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor ||
      a.losses - b.losses ||
      a.owner.localeCompare(b.owner),
  );
}

function buildWeeklyResults(rosters, weekGames) {
  const ownerByTeam = new Map(rosters.map((row) => [row.team_abbreviation, row.owner_name]));
  const weekly = new Map(
    Array.from(new Set(rosters.map((row) => row.owner_name))).map((owner) => [owner, { owner, wins: 0, losses: 0, points: 0 }]),
  );
  weekGames.forEach((game) => {
    [
      { team: game.away_team, score: game.away_score, opponentScore: game.home_score },
      { team: game.home_team, score: game.home_score, opponentScore: game.away_score },
    ].forEach(({ team, score, opponentScore }) => {
      const owner = ownerByTeam.get(team);
      if (!owner) return;
      const row = weekly.get(owner);
      row.points += score;
      if (score > opponentScore) row.wins += 1;
      if (score < opponentScore) row.losses += 1;
    });
  });
  return [...weekly.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || a.owner.localeCompare(b.owner));
}

function buildRecap(season, week, weekly, standings, weeklyHistory) {
  const winner = weekly[0];
  const leader = standings[0];
  return {
    season,
    week,
    title: `Week ${week}: ${winner.owner} takes the weekly crown`,
    summary: `${winner.owner} finished the week with ${winner.wins} wins and ${winner.points} points. ${leader.owner} leads the season with ${leader.wins} wins and ${leader.pointsFor} points.`,
    winner_name: winner.owner,
    recap_data: { weekly, standings, insights: buildRecapInsights(weekly, standings, weeklyHistory) },
    published: true,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildRecapInsights(weekly, standings, weeklyHistory) {
  const winner = weekly[0];
  const highScore = [...weekly].sort((a, b) => b.points - a.points || b.wins - a.wins)[0];
  const scoringEdge = [...standings]
    .map((entry) => ({ ...entry, differential: entry.pointsFor - entry.pointsAgainst }))
    .sort((a, b) => b.differential - a.differential || b.pointsFor - a.pointsFor)[0];
  const coldStreak = standings
    .map((entry) => ({
      owner: entry.owner,
      weeks: trailingLosingWeeks(entry.owner, weeklyHistory),
    }))
    .sort((a, b) => b.weeks - a.weeks || a.owner.localeCompare(b.owner))[0];

  const insights = [
    { label: "Weekly power", detail: `${winner.owner} took the week with ${winner.wins} wins and ${winner.points} points.` },
    {
      label: "Scoring edge",
      detail:
        scoringEdge.differential >= 0
          ? `${scoringEdge.owner} has the league's best point differential at +${scoringEdge.differential}.`
          : `${scoringEdge.owner} has the league's best point differential at ${scoringEdge.differential}.`,
    },
  ];

  if (coldStreak.weeks >= 2) {
    insights.push({ label: "Cold streak", detail: `${coldStreak.owner} has posted a losing weekly record ${coldStreak.weeks} weeks in a row.` });
  } else if (highScore.owner !== winner.owner) {
    insights.push({ label: "High score", detail: `${highScore.owner} led all rosters with ${highScore.points} points, despite not taking the weekly crown.` });
  } else {
    insights.push({ label: "Complete performance", detail: `${winner.owner} paired the weekly crown with the week's top scoring total.` });
  }

  return insights;
}

function trailingLosingWeeks(owner, weeklyHistory) {
  let streak = 0;
  for (const week of [...weeklyHistory].reverse()) {
    const result = week.find((entry) => entry.owner === owner);
    if (!result || result.losses <= result.wins) break;
    streak += 1;
  }
  return streak;
}
