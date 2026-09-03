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
  selectedOwner: "",
  selectedHeadToHeadOwner: "",
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
  weeklyOwnerSummary: document.querySelector("#weeklyOwnerSummary"),
  gamesGrid: document.querySelector("#gamesGrid"),
  headToHeadMatrix: document.querySelector("#headToHeadMatrix"),
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
    els.weekSelect.value = String(state.selectedWeek);
    updateUrlState();
    render();
    syncScores({ full: true });
  });

  els.weekSelect.addEventListener("change", (event) => {
    state.selectedWeek = Number(event.target.value);
    updateUrlState();
    render();
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
    });
  });

}

function buildSeasonSelect() {
  els.seasonSelect.innerHTML = SEASONS.map((season) => `<option value="${season}">${season}</option>`).join("");
  els.seasonSelect.value = String(state.season);
}

function buildWeekSelect() {
  els.weekSelect.innerHTML = WEEKS.map((week) => `<option value="${week}">Week ${week}</option>`).join("");
  els.weekSelect.value = String(state.selectedWeek);
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

async function fetchScoreboard(week) {
  const url = new URL(SCOREBOARD_API_URL, window.location.origin);
  url.searchParams.set("seasontype", String(REGULAR_SEASON_TYPE));
  if (week) {
    url.searchParams.set("week", String(week));
    url.searchParams.set("dates", String(state.season));
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
      state.selectedWeek = state.selectedWeek || state.currentWeek;
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
  renderHeadToHead(model);
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
  const h2h = new Map();
  owners.forEach((a) => {
    h2h.set(a.owner, new Map());
    owners.forEach((b) => h2h.get(a.owner).set(b.owner, 0));
  });

  const allGames = Object.values(state.gamesByWeek).flat();

  allGames.forEach((game) => {
    if (game.competitors.length < 2) return;
    const [first, second] = game.competitors;
    const pairs = [first, second].map((team) => ({
      team,
      owner: ownerByTeam.get(team.abbrev),
    }));

    pairs.forEach(({ team, owner }, index) => {
      if (!owner) return;
      const row = standingsByOwner.get(owner);
      const opponent = pairs[index === 0 ? 1 : 0].team;
      row.pointsFor += team.score;
      row.pointsAgainst += opponent.score;

      if (game.completed) {
        row.gamesFinal += 1;
        if (team.score > opponent.score) row.wins += 1;
        if (team.score < opponent.score) row.losses += 1;
        if (team.score === opponent.score) row.ties += 1;
      } else if (isLive(game)) {
        row.gamesLive += 1;
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
    h2h,
    allGames,
    selectedGames: state.gamesByWeek[state.selectedWeek] || [],
  };
}

function renderSummary(model) {
  els.seasonValue.textContent = state.season;
  els.weekValue.textContent = state.selectedWeek;
  els.liveGamesValue.textContent = model.allGames.filter(isLive).length;
  els.finalGamesValue.textContent = model.allGames.filter((game) => game.completed).length;
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
            <span class="mini-label">${entry.teams.length} teams loaded</span>
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

function renderTeamChip(team, model) {
  const name = teamName(team);
  const games = model.allGames.filter((game) =>
    game.competitors.some((competitor) => competitor.abbrev === team),
  );
  const wins = games.filter((game) => {
    const mine = game.competitors.find((competitor) => competitor.abbrev === team);
    return game.completed && mine?.winner;
  }).length;

  return `
    <div class="team-chip">
      <div class="team-id">
        <img class="team-logo" src="${logoFor(team)}" alt="" />
        <div class="team-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${team}</span>
        </div>
      </div>
      <div class="metric">${wins} W</div>
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
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(SCORE_CACHE_KEY)) || {};
  } catch {
    cache = {};
  }
  cache[state.season] = state.gamesByWeek;
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
