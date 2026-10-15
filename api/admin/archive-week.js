import { requireAdmin } from "../_admin.js";
import { archiveCurrentSeason } from "../_archive.js";
import { getSupabaseConfig, sendJson } from "../_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Supabase is not configured" });

  try {
    const admin = await requireAdmin(config, request);
    if (!admin) return sendJson(response, 403, { error: "Administrator access required" });
    return sendJson(response, 200, { ...(await archiveCurrentSeason(config)), archivedBy: admin.email });
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Archive failed" });
  }
}
