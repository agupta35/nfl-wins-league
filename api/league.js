import { getSupabaseConfig, sendJson, supabaseRequest } from "./_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });

  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "League database is not configured" });

  try {
    const [seasonsResponse, rostersResponse, recapsResponse, storiesResponse] = await Promise.all([
      supabaseRequest(config, "/rest/v1/league_seasons?select=season,regular_season_only&order=season.desc"),
      supabaseRequest(config, "/rest/v1/season_rosters?select=season,owner_name,team_abbreviation&order=season.desc,owner_name.asc,team_abbreviation.asc"),
      supabaseRequest(config, "/rest/v1/weekly_recaps?select=season,week,title,summary,winner_name,recap_data,generated_at&published=eq.true&order=season.desc,week.desc"),
      supabaseRequest(config, "/rest/v1/league_stories?select=season,week,story_type,headline,body,generated_at&order=season.desc,week.desc,generated_at.desc"),
    ]);
    const [seasons, rosters, recaps, stories] = await Promise.all([
      seasonsResponse.json(),
      rostersResponse.json(),
      recapsResponse.json(),
      storiesResponse.json(),
    ]);
    // League history changes immediately after a manual or scheduled archive.
    response.setHeader("cache-control", "no-store");
    return sendJson(response, 200, { seasons, rosters, recaps, stories });
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Unable to load league data" });
  }
}
