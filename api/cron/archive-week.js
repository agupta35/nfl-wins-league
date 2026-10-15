import { archiveCurrentSeason } from "../_archive.js";
import { getSupabaseConfig, sendJson } from "../_supabase.js";

export default async function handler(request, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }
  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Supabase is not configured" });

  try {
    return sendJson(response, 200, await archiveCurrentSeason(config, { includeAiNarrative: true }));
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Archive failed" });
  }
}
