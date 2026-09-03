const SCOREBOARD_API_URL = "/api/scoreboard";
const SCORE_CACHE_KEY = "wins-pool-score-cache-v1";
const POLL_MS = 60_000;
const FULL_REFRESH_MS = 10 * 60_000;
const REGULAR_SEASON_TYPE = 2;
const SEASONS = [2026, 2025, 2024];
const WEEKS = Array.from({ length: 18 }, (_, index) => index + 1);

const NFL_TEAMS = [
  ["ARI", "Arizona Cardinals"],
  ["ATL", "Atlanta Falcons"],
  ["BAL", "Baltimore Ravens"],
  ["BUF", "Buffalo Bills"],
  ["CAR", "Carolina Panthers"],
  ["CHI", "Chicago Bears"],
  ["CIN", "Cincinnati Bengals"],
  ["CLE", "Cleveland Browns"],
  ["DAL", "Dallas Cowboys"],
  ["DEN", "Denver Broncos"],
  ["DET", "Detroit Lions"],
  ["GB", "Green Bay Packers"],
  ["HOU", "Houston Texans"],
  ["IND", "Indianapolis Colts"],
  ["JAX", "Jacksonville Jaguars"],
  ["KC", "Kansas City Chiefs"],
  ["LAC", "Los Angeles Chargers"],
  ["LAR", "Los Angeles Rams"],
  ["LV", "Las Vegas Raiders"],
  ["MIA", "Miami Dolphins"],
  ["MIN", "Minnesota Vikings"],
  ["NE", "New England Patriots"],
  ["NO", "New Orleans Saints"],
  ["NYG", "New York Giants"],
  ["NYJ", "New York Jets"],
  ["PHI", "Philadelphia Eagles"],
  ["PIT", "Pittsburgh Steelers"],
  ["SEA", "Seattle Seahawks"],
  ["SF", "San Francisco 49ers"],
  ["TB", "Tampa Bay Buccaneers"],
  ["TEN", "Tennessee Titans"],
  ["WSH", "Washington Commanders"],
];

const TEAM_ALIASES = {
  "49ers": "SF",
  bears: "CHI",
  bengals: "CIN",
  bills: "BUF",
  broncos: "DEN",
  browns: "CLE",
  buccaneers: "TB",
  cardinals: "ARI",
  chargers: "LAC",
  chiefs: "KC",
  colts: "IND",
  commies: "WSH",
  commanders: "WSH",
  cowboys: "DAL",
  dolphins: "MIA",
  eagles: "PHI",
  falcons: "ATL",
  giants: "NYG",
  jaguars: "JAX",
  jets: "NYJ",
  lions: "DET",
  packers: "GB",
  panthers: "CAR",
  patriots: "NE",
  raiders: "LV",
  rams: "LAR",
  ravens: "BAL",
  saints: "NO",
  seahawks: "SEA",
  steelers: "PIT",
  texans: "HOU",
  titans: "TEN",
  vikings: "MIN",
};

const INITIAL_DRAFT = [
  {
    owner: "Carlton",
    teams: ["DET", "HOU", "GB", "TB", "CAR", "LV"],
  },
  {
    owner: "A-Rod",
    teams: ["BUF", "CIN", "PHI", "PIT", "IND", "CLE"],
  },
  {
    owner: "Logan",
    teams: ["LAR", "DEN", "SF", "JAX", "NO", "NYJ"],
  },
  {
    owner: "Jared",
    teams: ["BAL", "DAL", "CHI", "MIN", "NYG", "ATL"],
  },
  {
    owner: "Ash",
    teams: ["SEA", "NE", "KC", "LAC", "WSH", "TEN"],
  },
];

const state = {
  draft: cloneDraft(INITIAL_DRAFT),
  season: getInitialSeason(),
  gamesByWeek: loadScoreCache(getInitialSeason()),
  currentWeek: getInitialSeason() === SEASONS[0] ? 1 : 18,
  selectedWeek: getInitialWeek(),
  selectedWeekIsManual: new URLSearchParams(window.location.search).has("week"),
  selectedOwner: "",
  selectedHeadToHeadOwner: "",
  yearlyStandings: null,
  yearlyIsLoading: false,
  lastSync: null,
  fullRefreshAt: 0,
  isSyncing: false,
};

const els = {
  feedStatus: document.querySelector("#feedStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  seasonSelect: document.querySelector("#seasonSelect"),
  seasonValue: document.querySelector("#seasonValue"),
  weekValue: document.querySelector("#weekValue"),
  liveGamesValue: document.querySelector("#liveGamesValue"),
  finalGamesValue: document.querySelector("#finalGamesValue"),
  lastSyncValue: document.querySelector("#lastSyncValue"),
  leaderboard: document.querySelector("#leaderboard"),
  leaderName: document.querySelector("#leaderName"),
  leaderRecord: document.querySelector("#leaderRecord"),
  leaderTeams: document.querySelector("#leaderTeams"),
  weekSelect: document.querySelector("#weekSelect"),
  rosterWeekSelect: document.querySelector("#rosterWeekSelect"),
  weeklyOwnerSummary: document.querySelector("#weeklyOwnerSummary"),
  gamesGrid: document.querySelector("#gamesGrid"),
  rosterGrid: document.querySelector("#rosterGrid"),
  headToHeadMatrix: document.querySelector("#headToHeadMatrix"),
  yearToYearStatus: document.querySelector("#yearToYearStatus"),
  yearToYearBoard: document.querySelector("#yearToYearBoard"),
};

init();

function init() {
  buildSeasonSelect();
  buildWeekSelect();
  bindEvents();
  render();
  syncScores({ full: true });
  window.setInterval(() => syncScores({ full: false }), POLL_MS);
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => syncScores({ full: true }));
  els.seasonSelect.addEventListener("change", () => {
    state.season = Number(els.seasonSelect.value);
    state.gamesByWeek = loadScoreCache(state.season);
    state.currentWeek = state.season === SEASONS[0] ? state.currentWeek : 18;
    state.selectedWeek = state.season === SEASONS[0] ? 1 : 18;
    state.selectedWeekIsManual = state.season !== SEASONS[0];
    els.weekSelect.value = String(state.selectedWeek);
    updateUrlState();
    render();
    syncScores({ full: true });
  });

  els.weekSelect.addEventListener("change", (event) => {
    setSelectedWeek(event.target.value);
  });

  els.rosterWeekSelect.addEventListener("change", (event) => {
    setSelectedWeek(event.target.value);
  });

  els.weeklyOwnerSummary.addEventListener("click", (event) => {
    const button = event.target.closest("[data-owner]");
    if (!button) return;
    state.selectedOwner = button.dataset.owner;
    render();
  });

  els.headToHeadMatrix.addEventListener("click", (event) => {
    const button = event.target.closest("[data-h2h-owner]");
    if (!button) return;
    state.selectedHeadToHeadOwner = button.dataset.h2hOwner;
    renderHeadToHead(buildLeagueModel());
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.tab}Tab`).classList.add("active");
      if (button.dataset.tab === "yearToYear") loadYearToYearStandings();
    });
  });

}

function setSelectedWeek(week) {
  state.selectedWeek = Number(week);
  state.selectedWeekIsManual = true;
  updateUrlState();
  render();
}

function buildSeasonSelect() {
  els.seasonSelect.innerHTML = SEASONS.map((season) => `<option value="${season}">${season}</option>`).join("");
  els.seasonSelect.value = String(state.season);
}

function buildWeekSelect() {
  const options = WEEKS.map((week) => `<option value="${week}">Week ${week}</option>`).join("");
  els.weekSelect.innerHTML = options;
  els.rosterWeekSelect.innerHTML = options;
  els.weekSelect.value = String(state.selectedWeek);
  els.rosterWeekSelect.value = String(state.selectedWeek);
}

function getInitialSeason() {
  const season = Number(new URLSearchParams(window.location.search).get("season"));
  return SEASONS.includes(season) ? season : SEASONS[0];
}

function getInitialWeek() {
  const week = Number(new URLSearchParams(window.location.search).get("week"));
  return WEEKS.includes(week) ? week : getInitialSeason() === SEASONS[0] ? 1 : 18;
}

function updateUrlState() {
  const url = new URL(window.location.href);
  url.searchParams.set("season", String(state.season));
  url.searchParams.set("week", String(state.selectedWeek));
  window.history.replaceState({}, "", url);
}

async function syncScores({ full }) {
  if (state.isSyncing) return;
  state.isSyncing = true;
  els.feedStatus.textContent = "Syncing";
  els.refreshButton.disabled = true;

  try {
    if (state.season === SEASONS[0]) {
      const current = await fetchScoreboard();
      ingestScoreboard(current, { updateContext: true });
    }

    const now = Date.now();
    const shouldFullRefresh = full || now - state.fullRefreshAt > FULL_REFRESH_MS;
    if (shouldFullRefresh) {
      state.fullRefreshAt = now;
      await refreshAllWeeks();
    } else {
      const currentWeekBoard = await fetchScoreboard(state.currentWeek);
      ingestScoreboard(currentWeekBoard);
    }

    state.lastSync = new Date();
    saveScoreCache();
    els.feedStatus.textContent = "Live";
  } catch (error) {
    console.error(error);
    els.feedStatus.textContent = "Offline cache";
  } finally {
    state.isSyncing = false;
    els.refreshButton.disabled = false;
    render();
  }
}

async function refreshAllWeeks() {
  const boards = await Promise.all(
    WEEKS.map((week) =>
      fetchScoreboard(week).catch((error) => {
        console.warn(`Week ${week} failed`, error);
        return null;
      }),
    ),
  );

  boards.filter(Boolean).forEach((board) => ingestScoreboard(board));
}

async function fetchScoreboard(week, season = state.season) {
  const url = new URL(SCOREBOARD_API_URL, window.location.origin);
  url.searchParams.set("seasontype", String(REGULAR_SEASON_TYPE));
  if (week) {
    url.searchParams.set("week", String(week));
    url.searchParams.set("dates", String(season));
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${response.status}`);
  return response.json();
}

function ingestScoreboard(board, { updateContext = false } = {}) {
  if (updateContext && board.season?.year) {
    state.season = Number(board.season.year);
    els.seasonSelect.value = String(state.season);
  }
  if (board.week?.number) {
    if (updateContext) {
      state.currentWeek = Number(board.week.number);
      if (!state.selectedWeekIsManual) state.selectedWeek = state.currentWeek;
      els.weekSelect.value = String(state.selectedWeek);
    }
  }

  const week = Number(board.week?.number || board.events?.[0]?.week?.number || state.currentWeek);
  if (!week) return;

  state.gamesByWeek[week] = (board.events || []).map(normalizeGame);
}

function normalizeGame(event) {
  const competition = event.competitions?.[0] || {};
  const competitors = (competition.competitors || []).map((competitor) => ({
    abbrev: competitor.team?.abbreviation,
    displayName: competitor.team?.displayName,
    shortName: competitor.team?.shortDisplayName || competitor.team?.name,
    logo: competitor.team?.logo,
    score: Number(competitor.score || 0),
    homeAway: competitor.homeAway,
    winner: Boolean(competitor.winner),
  }));

  return {
    id: event.id,
    name: event.shortName || event.name,
    date: event.date,
    venue: competition.venue?.fullName || "",
    status: competition.status?.type?.name || event.status?.type?.name || "STATUS_SCHEDULED",
    statusText: competition.status?.type?.shortDetail || event.status?.type?.shortDetail || "",
    completed: Boolean(competition.status?.type?.completed || event.status?.type?.completed),
    competitors,
  };
}

function render() {
  const model = buildLeagueModel();
  renderSummary(model);
  renderLeaderboard(model);
  renderChampion(model);
  renderWeekly(model);
  renderRosters(model);
  renderHeadToHead(model);
  renderYearToYear();
}

async function loadYearToYearStandings() {
  if (state.yearlyIsLoading || state.yearlyStandings) return;

  state.yearlyIsLoading = true;
  renderYearToYear();

  try {
    const seasonRows = await Promise.all(
      SEASONS.map(async (season) => {
        const gamesByWeek = await loadSeasonGames(season);
        return [season, calculateSeasonStandings(gamesByWeek)];
      }),
    );
    state.yearlyStandings = new Map(seasonRows);
  } catch (error) {
    console.error(error);
    state.yearlyStandings = new Map();
  } finally {
    state.yearlyIsLoading = false;
    renderYearToYear();
  }
}

async function loadSeasonGames(season) {
  if (season === state.season && Object.keys(state.gamesByWeek).length === WEEKS.length) {
    return state.gamesByWeek;
  }

  const cached = loadScoreCache(season);
  if (Object.keys(cached).length === WEEKS.length) return cached;

  const boards = await Promise.all(WEEKS.map((week) => fetchScoreboard(week, season)));
  const gamesByWeek = {};
  boards.forEach((board, index) => {
    gamesByWeek[index + 1] = (board.events || []).map(normalizeGame);
  });
  saveSeasonScoreCache(season, gamesByWeek);
  return gamesByWeek;
}

function calculateSeasonStandings(gamesByWeek) {
  const ownerByTeam = new Map();
  state.draft.forEach((entry) => entry.teams.forEach((team) => ownerByTeam.set(team, entry.owner)));

  const standings = state.draft.map((entry) => ({
    owner: entry.owner,
    wins: 0,
    losses: 0,
    pointsFor: 0,
  }));
  const standingsByOwner = new Map(standings.map((entry) => [entry.owner, entry]));

  Object.values(gamesByWeek)
    .flat()
    .forEach((game) => {
      if (!game.completed || game.competitors.length < 2) return;
      const [first, second] = game.competitors;
      [first, second].forEach((team, index) => {
        const owner = ownerByTeam.get(team.abbrev);
        if (!owner) return;
        const row = standingsByOwner.get(owner);
        const opponent = index === 0 ? second : first;
        row.pointsFor += team.score;
        if (team.score > opponent.score) row.wins += 1;
        if (team.score < opponent.score) row.losses += 1;
      });
    });

  return standings.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor ||
      a.losses - b.losses ||
      a.owner.localeCompare(b.owner),
  );
}

function buildLeagueModel() {
  const ownerByTeam = new Map();
  const owners = state.draft
    .filter((entry) => entry.owner.trim())
    .map((entry) => ({
      owner: entry.owner.trim(),
      teams: entry.teams.filter(Boolean),
    }));

  owners.forEach((entry) => {
    entry.teams.forEach((team) => ownerByTeam.set(team, entry.owner));
  });

  const standings = owners.map((entry) => ({
    owner: entry.owner,
    teams: entry.teams,
    wins: 0,
    losses: 0,
    ties: 0,
    liveWins: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    gamesFinal: 0,
    gamesLive: 0,
  }));

  const standingsByOwner = new Map(standings.map((entry) => [entry.owner, entry]));
  const teamStats = new Map(
    owners.flatMap((entry) =>
      entry.teams.map((team) => [team, { wins: 0, losses: 0, ties: 0, live: false, pointsFor: 0 }]),
    ),
  );
  const h2h = new Map();
  owners.forEach((a) => {
    h2h.set(a.owner, new Map());
    owners.forEach((b) => h2h.get(a.owner).set(b.owner, 0));
  });

  const allGames = Object.values(state.gamesByWeek).flat();
  const cutoffGames = Object.entries(state.gamesByWeek)
    .filter(([week]) => Number(week) <= state.selectedWeek)
    .flatMap(([, games]) => games);

  cutoffGames.forEach((game) => {
    if (game.competitors.length < 2) return;
    const [first, second] = game.competitors;
    const pairs = [first, second].map((team) => ({
      team,
      owner: ownerByTeam.get(team.abbrev),
    }));

    pairs.forEach(({ team, owner }, index) => {
      if (!owner) return;
      const row = standingsByOwner.get(owner);
      const teamRow = teamStats.get(team.abbrev);
      const opponent = pairs[index === 0 ? 1 : 0].team;
      row.pointsFor += team.score;
      row.pointsAgainst += opponent.score;
      teamRow.pointsFor += team.score;

      if (game.completed) {
        row.gamesFinal += 1;
        if (team.score > opponent.score) {
          row.wins += 1;
          teamRow.wins += 1;
        }
        if (team.score < opponent.score) {
          row.losses += 1;
          teamRow.losses += 1;
        }
        if (team.score === opponent.score) {
          row.ties += 1;
          teamRow.ties += 1;
        }
      } else if (isLive(game)) {
        row.gamesLive += 1;
        teamRow.live = true;
        if (team.score > opponent.score) row.liveWins += 1;
      }
    });

    const [left, right] = pairs;
    if (game.completed && left.owner && right.owner && left.owner !== right.owner) {
      if (left.team.score > right.team.score) h2h.get(left.owner).set(right.owner, h2h.get(left.owner).get(right.owner) + 1);
      if (right.team.score > left.team.score) h2h.get(right.owner).set(left.owner, h2h.get(right.owner).get(left.owner) + 1);
    }
  });

  standings.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor ||
      a.losses - b.losses ||
      a.owner.localeCompare(b.owner),
  );

  return {
    owners,
    ownerByTeam,
    standings,
    teamStats,
    h2h,
    allGames,
    cutoffGames,
    selectedGames: state.gamesByWeek[state.selectedWeek] || [],
  };
}

function renderSummary(model) {
  els.seasonValue.textContent = state.season;
  els.weekValue.textContent = state.selectedWeek;
  els.liveGamesValue.textContent = model.cutoffGames.filter(isLive).length;
  els.finalGamesValue.textContent = model.cutoffGames.filter((game) => game.completed).length;
  els.lastSyncValue.textContent = state.lastSync
    ? state.lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "--";
}

function renderLeaderboard(model) {
  els.leaderboard.innerHTML = model.standings
    .map(
      (entry, index) => `
        <div class="leader-row">
          <div class="rank">${index + 1}</div>
          <div>
            <div class="owner-name">${escapeHtml(entry.owner)}</div>
          </div>
          <div class="metric">
            <span class="mini-label">Wins</span>
            ${entry.wins}
          </div>
          <div class="metric">
            <span class="mini-label">Pts</span>
            ${entry.pointsFor}
          </div>
          <div class="metric optional">
            <span class="mini-label">Live</span>
            ${entry.liveWins}
          </div>
          <div class="metric optional">
            <span class="mini-label">Diff</span>
            ${entry.pointsFor - entry.pointsAgainst}
          </div>
        </div>
      `,
    )
    .join("");
}

function renderChampion(model) {
  const leader = model.standings[0];
  if (!leader) return;

  els.leaderName.textContent = leader.owner;
  els.leaderRecord.textContent = `${leader.wins} wins / ${leader.pointsFor} pts`;
  els.leaderTeams.innerHTML = leader.teams.map((team) => renderTeamChip(team, model)).join("");
}

function renderRosters(model) {
  els.rosterWeekSelect.value = String(state.selectedWeek);
  els.rosterGrid.innerHTML = model.owners
    .map(
      (owner) => `
        <article class="roster-card">
          <div class="roster-card-top">
            <div>
              <p class="eyebrow">Through Week ${state.selectedWeek}</p>
              <h3>${escapeHtml(owner.owner)}</h3>
            </div>
            <span class="pill">${owner.teams.length} teams</span>
          </div>
          <div class="roster-teams">
            ${owner.teams
              .map((team) => {
                const stats = model.teamStats.get(team);
                const record = `${stats.wins}-${stats.losses}${stats.ties ? `-${stats.ties}` : ""}`;
                return `
                  <div class="roster-team-row">
                    <div class="team-id">
                      <img class="team-logo" src="${logoFor(team)}" alt="" />
                      <div class="team-copy"><strong>${escapeHtml(teamName(team))}</strong><span>${team}${stats.live ? " / Live" : ""}</span></div>
                    </div>
                    <div class="roster-team-stats"><strong>${record}</strong><span>${stats.pointsFor} pts</span></div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderWeekly(model) {
  els.weekSelect.value = String(state.selectedWeek);

  const ownerNames = model.owners.map((entry) => entry.owner);
  if (!ownerNames.includes(state.selectedOwner)) state.selectedOwner = ownerNames[0] || "";

  const ownerStats = new Map(
    model.owners.map((entry) => [
      entry.owner,
      {
        wins: 0,
        points: 0,
        live: 0,
        games: 0,
      },
    ]),
  );

  model.selectedGames.forEach((game) => {
    if (game.competitors.length < 2) return;
    const [first, second] = game.competitors;
    [first, second].forEach((team, index) => {
      const owner = model.ownerByTeam.get(team.abbrev);
      if (!owner) return;
      const opponent = index === 0 ? second : first;
      const stats = ownerStats.get(owner);
      stats.points += team.score;
      stats.games += 1;
      if (game.completed && team.score > opponent.score) stats.wins += 1;
      if (isLive(game)) stats.live += 1;
    });
  });

  els.weeklyOwnerSummary.innerHTML = Array.from(ownerStats.entries())
    .map(
      ([owner, stats]) => `
        <button class="owner-chip ${owner === state.selectedOwner ? "active" : ""}" data-owner="${escapeHtml(owner)}" type="button" aria-pressed="${owner === state.selectedOwner}">
          <div>
            <strong>${escapeHtml(owner)}</strong>
            <span>${stats.games} games, ${stats.live} live</span>
          </div>
          <div class="metric">${stats.wins} W / ${stats.points} PTS</div>
        </button>
      `,
    )
    .join("");

  const ownerGames = model.selectedGames
    .map((game) => {
      const selectedTeam = game.competitors.find(
        (team) => model.ownerByTeam.get(team.abbrev) === state.selectedOwner,
      );
      if (!selectedTeam) return null;
      return {
        game,
        selectedTeam,
        opponent: game.competitors.find((team) => team !== selectedTeam),
      };
    })
    .filter(Boolean);

  els.gamesGrid.innerHTML = ownerGames.length
    ? ownerGames.map(({ game, selectedTeam, opponent }) => renderOwnerMatchup(game, selectedTeam, opponent, model)).join("")
    : `<div class="notice">No ${escapeHtml(state.selectedOwner || "owner")} games are loaded for Week ${state.selectedWeek} yet. Try Sync Scores.</div>`;
}

function renderOwnerMatchup(game, selectedTeam, opponent, model) {
  const statusClass = game.completed ? "final" : isLive(game) ? "live" : "";
  const kickoff = new Date(game.date).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `
    <article class="matchup-card ${game.completed && selectedTeam.winner ? "won" : ""}">
      <div class="matchup-top">
        <span>${escapeHtml(kickoff)}</span>
        <span class="game-status ${statusClass}">${escapeHtml(game.statusText || game.status)}</span>
      </div>
      ${renderMatchupSide(selectedTeam, model, true)}
      <div class="matchup-divider"><span>VS</span></div>
      ${renderMatchupSide(opponent, model, false)}
    </article>
  `;
}

function renderMatchupSide(team, model, isSelected) {
  const owner = model.ownerByTeam.get(team.abbrev);
  const selectedClass = isSelected ? " selected-team" : "";

  return `
    <div class="matchup-side${selectedClass}">
      <div class="team-id">
        <img class="team-logo" src="${team.logo || logoFor(team.abbrev)}" alt="" />
        <div class="team-copy">
          <strong>${escapeHtml(team.displayName || team.abbrev)}</strong>
          <span>${team.homeAway === "home" ? "Home" : "Away"}${owner ? ` / <span class="owner-tag">${escapeHtml(owner)}</span>` : " / Undrafted"}</span>
        </div>
      </div>
      <div class="score">${team.score}</div>
    </div>
  `;
}

function renderHeadToHead(model) {
  const owners = model.owners.map((entry) => entry.owner);
  if (!owners.includes(state.selectedHeadToHeadOwner)) {
    state.selectedHeadToHeadOwner = state.selectedOwner || owners[0] || "";
  }

  const selectedOwner = state.selectedHeadToHeadOwner;
  const ownerTabs = owners
    .map(
      (owner) => `
        <button class="h2h-owner-button ${owner === selectedOwner ? "active" : ""}" data-h2h-owner="${escapeHtml(owner)}" type="button" aria-pressed="${owner === selectedOwner}">${escapeHtml(owner)}</button>
      `,
    )
    .join("");
  const matchups = owners
    .filter((owner) => owner !== selectedOwner)
    .map((opponent) => {
      const selectedWins = model.h2h.get(selectedOwner)?.get(opponent) || 0;
      const opponentWins = model.h2h.get(opponent)?.get(selectedOwner) || 0;
      const leaderClass = selectedWins > opponentWins ? " leading" : opponentWins > selectedWins ? " trailing" : "";
      return `
        <article class="h2h-matchup${leaderClass}">
          <div class="h2h-player selected"><strong>${escapeHtml(selectedOwner)}</strong><span>Wins</span></div>
          <div class="h2h-score"><strong>${selectedWins}</strong><span>-</span><strong>${opponentWins}</strong></div>
          <div class="h2h-player"><strong>${escapeHtml(opponent)}</strong><span>Wins</span></div>
        </article>
      `;
    })
    .join("");

  els.headToHeadMatrix.innerHTML = `
    <div class="h2h-owner-tabs" aria-label="Choose an owner">${ownerTabs}</div>
    <div class="h2h-list">${matchups || `<div class="notice">No head to head matchups are available yet.</div>`}</div>
  `;
}

function renderYearToYear() {
  if (state.yearlyIsLoading) {
    els.yearToYearStatus.textContent = "Loading seasons";
    els.yearToYearBoard.innerHTML = `<div class="notice">Loading regular-season results for 2024, 2025, and 2026.</div>`;
    return;
  }

  if (!state.yearlyStandings) {
    els.yearToYearStatus.textContent = "Load when opened";
    els.yearToYearBoard.innerHTML = `<div class="notice">Open this tab to load and compare regular-season results across each saved roster year.</div>`;
    return;
  }

  const years = [...SEASONS].sort((a, b) => a - b);
  const rows = state.draft
    .map((entry) => {
      const results = years.map((year) => state.yearlyStandings.get(year)?.find((row) => row.owner === entry.owner));
      const totalWins = results.reduce((total, row) => total + (row?.wins || 0), 0);
      const totalPoints = results.reduce((total, row) => total + (row?.pointsFor || 0), 0);
      return { owner: entry.owner, results, totalWins, totalPoints };
    })
    .sort(
      (a, b) =>
        b.totalWins - a.totalWins ||
        b.totalPoints - a.totalPoints ||
        a.owner.localeCompare(b.owner),
    );

  els.yearToYearStatus.textContent = "Regular season only";
  els.yearToYearBoard.innerHTML = rows
    .map(
      (entry, index) => `
        <article class="yearly-row">
          <div class="yearly-owner"><span class="rank">${index + 1}</span><strong>${escapeHtml(entry.owner)}</strong></div>
          ${entry.results
            .map((result, year) => `
              <div class="yearly-season-stat">
                <span>${years[year]}</span>
                <strong>${result ? `${result.wins} W` : "--"}</strong>
                <small>${result ? `${result.pointsFor} pts` : "No roster"}</small>
              </div>
            `)
            .join("")}
          <div class="yearly-total"><span>Total</span><strong>${entry.totalWins} W</strong><small>${entry.totalPoints} pts</small></div>
        </article>
      `,
    )
    .join("");
}

function renderTeamChip(team, model) {
  const name = teamName(team);
  const stats = model.teamStats.get(team);

  return `
    <div class="team-chip">
      <div class="team-id">
        <img class="team-logo" src="${logoFor(team)}" alt="" />
        <div class="team-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${team}</span>
        </div>
      </div>
      <div class="metric">${stats.wins}-${stats.losses}${stats.ties ? `-${stats.ties}` : ""}</div>
    </div>
  `;
}

function loadScoreCache(season) {
  try {
    const cache = JSON.parse(localStorage.getItem(SCORE_CACHE_KEY)) || {};
    if (cache[season]) return cache[season];
    if (Array.isArray(cache[1])) return cache;
    return {};
  } catch {
    localStorage.removeItem(SCORE_CACHE_KEY);
    return {};
  }
}

function saveScoreCache() {
  saveSeasonScoreCache(state.season, state.gamesByWeek);
}

function saveSeasonScoreCache(season, gamesByWeek) {
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(SCORE_CACHE_KEY)) || {};
  } catch {
    cache = {};
  }
  cache[season] = gamesByWeek;
  localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(cache));
}

function cloneDraft(draft) {
  return draft.map((entry) => ({
    owner: entry.owner,
    teams: [...entry.teams],
  }));
}

function isLive(game) {
  const status = String(game.status || "").toLowerCase();
  const text = String(game.statusText || "").toLowerCase();
  return !game.completed && (status.includes("in_progress") || text.includes("quarter") || text.includes("halftime"));
}

function teamName(abbrev) {
  return NFL_TEAMS.find(([team]) => team === abbrev)?.[1] || abbrev;
}

function logoFor(abbrev) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/${abbrev.toLowerCase()}.png`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
