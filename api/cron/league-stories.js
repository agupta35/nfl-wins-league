import { loadLiveStoryFacts } from "../_live-story-data.js";
import { generateNarrative, saveStory } from "../_stories.js";
import { getSupabaseConfig, sendJson } from "../_supabase.js";

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
    const { season, week, facts } = await loadLiveStoryFacts(config, storyType);
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
