import { requireAdmin } from "../_admin.js";
import { getSupabaseConfig, sendJson } from "../_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const config = getSupabaseConfig();
  if (!config) return sendJson(response, 503, { error: "Authentication is not configured" });

  try {
    const admin = await requireAdmin(config, request);
    if (!admin) return sendJson(response, 403, { authenticated: false, admin: false });
    return sendJson(response, 200, { authenticated: true, admin: true, ...admin });
  } catch (error) {
    console.error(error);
    return sendJson(response, 502, { error: "Unable to verify session" });
  }
}
