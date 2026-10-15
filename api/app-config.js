export default function handler(request, response) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  response.setHeader("cache-control", "no-store");
  response.status(200).json({
    supabaseUrl: url || null,
    supabaseAnonKey: anonKey || null,
  });
}
