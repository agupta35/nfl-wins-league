import { requireAdmin } from "../_admin.js";
import { loadLiveStoryFacts } from "../_live-story-data.js";
import { generateNarrative, generateSeasonStory, generateWeeklyRecapNarrative, saveStory } from "../_stories.js";
import { getSupabaseConfig, sendJson, supabaseRequest } from "../_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Supabase is not configured" });

  try {
    const admin = await requireAdmin(config, request);
    if (!admin) return sendJson(response, 403, { error: "Administrator access required" });

    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const season = Number(body?.season);
    const storyType = body?.storyType || "week_past";
    if (!Number.isInteger(season)) return sendJson(response, 400, { error: "A valid season is required" });
    if (!["week_past", "week_ahead", "in_progress", "season"].includes(storyType)) {
      return sendJson(response, 400, { error: "An eligible Commish story type is required" });
    }

    if (storyType === "week_past" || storyType === "season") {
      const recapResponse = await supabaseRequest(
        config,
        `/rest/v1/weekly_recaps?select=season,week,winner_name,recap_data&season=eq.${season}&published=eq.true&order=week.desc&limit=1`,
      );
      const [recap] = await recapResponse.json();
      if (!recap) return sendJson(response, 404, { error: "Archive a completed week before publishing this report" });

      if (storyType === "season") {
      const narrative = await generateSeasonStory(config, season, recap.week, recap.recap_data.standings || [], { throwOnError: true });
        if (!narrative) return sendJson(response, 502, { error: "The Commish could not generate a report" });
        await saveStory(config, {
          season,
          week: recap.week,
          storyType: "season",
          ...narrative,
          facts: { standings: recap.recap_data.standings || [], week: recap.week },
        });
        return sendJson(response, 200, { week: recap.week, storyType, headline: narrative.headline, publishedBy: admin.email });
      }

      const narrative = await generateWeeklyRecapNarrative(config, recap, { throwOnError: true });
      if (!narrative) return sendJson(response, 502, { error: "The Commish could not generate a report" });
      const recapData = { ...recap.recap_data, aiNarrative: narrative };
      await supabaseRequest(config, `/rest/v1/weekly_recaps?season=eq.${season}&week=eq.${recap.week}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ recap_data: recapData, updated_at: new Date().toISOString() }),
      });
      return sendJson(response, 200, { week: recap.week, storyType, headline: narrative.headline, publishedBy: admin.email });
    }

    const liveStoryType = storyType === "in_progress" ? "in_progress" : "week_ahead";
    const live = await loadLiveStoryFacts(config, liveStoryType);
    const narrative = await generateNarrative(config, liveStoryType, live.facts, { throwOnError: true });
    if (!narrative) return sendJson(response, 502, { error: "The Commish could not generate a report" });
    await saveStory(config, { ...live, storyType: liveStoryType, ...narrative });
    return sendJson(response, 200, { week: live.week, storyType: liveStoryType, headline: narrative.headline, publishedBy: admin.email });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message.startsWith("AI Gateway")
      ? `The AI Gateway rejected the request: ${error.message.slice(0, 520)}`
      : "The Commish could not publish the report";
    return sendJson(response, 502, { error: message });
  }
}
