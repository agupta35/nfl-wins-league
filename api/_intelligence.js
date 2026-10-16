import { supabaseRequest } from "./_supabase.js";

const MAX_SELECTED_CANDIDATES = 4;

export async function refreshLeagueIntelligence(config, season, recaps) {
  const orderedRecaps = [...recaps].sort((a, b) => a.week - b.week);
  if (!orderedRecaps.length) return { candidates: [], storylines: [] };

  const candidates = orderedRecaps.flatMap((recap, index) =>
    discoverCandidates(recap, orderedRecaps[index - 1]),
  );
  const byWeek = new Map();
  candidates.forEach((candidate) => {
    const list = byWeek.get(candidate.week) || [];
    list.push(candidate);
    byWeek.set(candidate.week, list);
  });
  byWeek.forEach((weekCandidates) => {
    weekCandidates
      .sort((a, b) => b.impact_score - a.impact_score || b.novelty_score - a.novelty_score || a.candidate_key.localeCompare(b.candidate_key))
      .forEach((candidate, index) => {
        candidate.selected = index < MAX_SELECTED_CANDIDATES;
      });
  });

  await supabaseRequest(config, "/rest/v1/league_story_candidates?on_conflict=season,week,candidate_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(candidates.map((candidate) => ({ ...candidate, season, updated_at: new Date().toISOString() }))),
  });

  const storylines = buildStorylines(orderedRecaps, candidates);
  await supabaseRequest(config, `/rest/v1/league_storylines?season=eq.${season}&status=eq.developing`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "dormant", updated_at: new Date().toISOString() }),
  });
  if (storylines.length) {
    await supabaseRequest(config, "/rest/v1/league_storylines?on_conflict=season,storyline_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(storylines.map((storyline) => ({ ...storyline, season, updated_at: new Date().toISOString() }))),
    });
  }
  return { candidates, storylines };
}

export async function loadEditorialBrief(config, season, week) {
  const [candidatesResponse, storylinesResponse] = await Promise.all([
    supabaseRequest(config, `/rest/v1/league_story_candidates?select=candidate_type,owners,facts,impact_score,novelty_score&season=eq.${season}&week=eq.${week}&selected=eq.true&order=impact_score.desc,novelty_score.desc`),
    supabaseRequest(config, `/rest/v1/league_storylines?select=storyline_type,owners,status,started_week,last_covered_week,details&season=eq.${season}&status=eq.developing&order=last_covered_week.desc&limit=4`),
  ]);
  const [candidates, storylines] = await Promise.all([candidatesResponse.json(), storylinesResponse.json()]);
  return { candidates, storylines };
}

function discoverCandidates(recap, previousRecap) {
  const week = recap.week;
  const standings = recap.recap_data?.standings || [];
  const weekly = recap.recap_data?.weekly || [];
  const previousStandings = previousRecap?.recap_data?.standings || [];
  const previousRanks = new Map(previousStandings.map((entry, index) => [entry.owner, index + 1]));
  const candidates = [];
  const crown = weekly.find((entry) => entry.owner === recap.winner_name) || weekly[0];
  if (crown) {
    candidates.push(candidate(week, `weekly-crown-${crown.owner}`, "weekly_crown", [crown.owner], {
      winner: crown.owner,
      weeklyWins: crown.wins,
      weeklyPoints: crown.points,
      seasonRecord: recordFor(crown.owner, standings),
    }, 88, 70));
  }

  const leader = standings[0];
  const previousLeader = previousStandings[0];
  if (leader && previousLeader && leader.owner !== previousLeader.owner) {
    candidates.push(candidate(week, `lead-change-${leader.owner}`, "lead_change", [leader.owner, previousLeader.owner], {
      newLeader: leader.owner,
      displacedLeader: previousLeader.owner,
      leaderRecord: recordFor(leader.owner, standings),
    }, 98, 96));
  }

  standings.forEach((entry, index) => {
    const currentRank = index + 1;
    const previousRank = previousRanks.get(entry.owner);
    if (!previousRank || previousRank === currentRank) return;
    const movement = previousRank - currentRank;
    if (Math.abs(movement) < 2) return;
    candidates.push(candidate(week, `${movement > 0 ? "climb" : "fall"}-${entry.owner}`, movement > 0 ? "power_shift_up" : "power_shift_down", [entry.owner], {
      owner: entry.owner,
      fromRank: previousRank,
      toRank: currentRank,
      movement,
      record: recordFor(entry.owner, standings),
    }, 68 + Math.min(24, Math.abs(movement) * 8), 76));
  });

  if (standings.length > 1 && leader) {
    const challenger = standings[1];
    const winGap = leader.wins - challenger.wins;
    if (winGap <= 3) {
      candidates.push(candidate(week, "title-race", "title_race", [leader.owner, challenger.owner], {
        leader: leader.owner,
        challenger: challenger.owner,
        winGap,
        leaderRecord: recordFor(leader.owner, standings),
        challengerRecord: recordFor(challenger.owner, standings),
      }, 84 - Math.max(0, winGap * 5), 62));
    }
  }

  const coldOwner = weekly
    .map((entry) => ({ owner: entry.owner, losingWeeks: trailingLosingWeeks(entry.owner, recap, previousRecap) }))
    .sort((a, b) => b.losingWeeks - a.losingWeeks || a.owner.localeCompare(b.owner))[0];
  if (coldOwner?.losingWeeks >= 2) {
    candidates.push(candidate(week, `cold-streak-${coldOwner.owner}`, "cold_streak", [coldOwner.owner], {
      owner: coldOwner.owner,
      losingWeeks: coldOwner.losingWeeks,
      record: recordFor(coldOwner.owner, standings),
    }, 75, 72));
  }
  return candidates;
}

function buildStorylines(recaps, candidates) {
  const latestWeek = recaps.at(-1).week;
  const currentCandidates = candidates.filter(
    (entry) =>
      entry.week === latestWeek &&
      entry.selected &&
      ["title_race", "power_shift_up", "power_shift_down", "cold_streak"].includes(entry.candidate_type),
  );
  return currentCandidates.map((entry) => {
    const storyline_key = entry.candidate_type === "title_race"
      ? "title-race"
      : `${entry.candidate_type}:${entry.owners[0]}`;
    const firstRelatedCandidate = candidates.find((candidate) => {
      const candidateKey = candidate.candidate_type === "title_race"
        ? "title-race"
        : `${candidate.candidate_type}:${candidate.owners[0]}`;
      return candidateKey === storyline_key;
    });
    return {
    storyline_key,
    storyline_type: entry.candidate_type,
    owners: entry.owners,
    status: "developing",
    started_week: firstRelatedCandidate?.week || latestWeek,
    last_covered_week: latestWeek,
    details: entry.facts,
    };
  });
}

function candidate(week, candidate_key, candidate_type, owners, facts, impact_score, novelty_score) {
  return { week, candidate_key, candidate_type, owners, facts, impact_score, novelty_score, selected: false };
}

function recordFor(owner, standings) {
  const row = standings.find((entry) => entry.owner === owner);
  return row ? `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}` : null;
}

function trailingLosingWeeks(owner, recap, previousRecap) {
  const current = recap.recap_data?.weekly?.find((entry) => entry.owner === owner);
  if (!current || current.losses <= current.wins) return 0;
  const previous = previousRecap?.recap_data?.weekly?.find((entry) => entry.owner === owner);
  return previous && previous.losses > previous.wins ? 2 : 1;
}
