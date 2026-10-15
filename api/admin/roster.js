import { requireAdmin } from "../_admin.js";
import { getSupabaseConfig, sendJson, supabaseRequest } from "../_supabase.js";

const TEAM_CODE = /^[A-Z]{2,3}$/;

export default async function handler(request, response) {
  if (request.method !== "PUT") return sendJson(response, 405, { error: "Method not allowed" });
  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Supabase is not configured" });

  try {
    const admin = await requireAdmin(config, request);
    if (!admin) return sendJson(response, 403, { error: "Administrator access required" });
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const season = Number(body?.season);
    const rosters = body?.rosters;
    if (!Number.isInteger(season) || season < 2000 || season > 2100 || !Array.isArray(rosters) || !rosters.length) {
      return sendJson(response, 400, { error: "Invalid roster payload" });
    }

    const rows = rosters.flatMap((entry) =>
      (entry.teams || []).map((team) => ({
        season,
        owner_name: String(entry.owner || "").trim(),
        team_abbreviation: String(team || "").trim().toUpperCase(),
      })),
    );
    const teams = rows.map((row) => row.team_abbreviation);
    if (
      !rows.length ||
      rows.some((row) => !row.owner_name || !TEAM_CODE.test(row.team_abbreviation)) ||
      new Set(teams).size !== teams.length
    ) {
      return sendJson(response, 400, { error: "Teams must be unique NFL abbreviations" });
    }

    await supabaseRequest(config, "/rest/v1/rpc/replace_season_roster", {
      method: "POST",
      body: JSON.stringify({
        target_season: season,
        roster: rows.map(({ owner_name, team_abbreviation }) => ({ owner_name, team_abbreviation })),
      }),
    });
    return sendJson(response, 200, { season, teams: rows.length, updatedBy: admin.email });
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Unable to save roster" });
  }
}
