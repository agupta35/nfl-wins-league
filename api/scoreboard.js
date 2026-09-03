const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export default async function handler(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const upstream = new URL(ESPN_SCOREBOARD_URL);

  for (const [key, value] of requestUrl.searchParams.entries()) {
    upstream.searchParams.set(key, value);
  }

  try {
    const upstreamResponse = await fetch(upstream.toString(), {
      headers: { accept: "application/json" },
    });
    const body = await upstreamResponse.text();

    response.setHeader("content-type", upstreamResponse.headers.get("content-type") || "application/json");
    response.setHeader("cache-control", "public, max-age=20");
    response.status(upstreamResponse.status).send(body);
  } catch {
    response.status(502).json({ error: "Unable to load the NFL scoreboard." });
  }
}
