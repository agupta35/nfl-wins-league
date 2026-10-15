import { supabaseRequest } from "./_supabase.js";

export async function requireAdmin(config, request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const userResponse = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!userResponse.ok) return null;

  const user = await userResponse.json();
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const adminResponse = await supabaseRequest(
    config,
    `/rest/v1/league_admins?select=email,display_name&email=eq.${encodeURIComponent(email)}&active=eq.true`,
  );
  let [admin] = await adminResponse.json();
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin && initialAdminEmail === email) {
    await supabaseRequest(config, "/rest/v1/league_admins", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{ email, display_name: user.user_metadata?.full_name || null, active: true }]),
    });
    admin = { email, display_name: user.user_metadata?.full_name || null };
  }
  return admin ? { email, displayName: admin.display_name || email } : null;
}
