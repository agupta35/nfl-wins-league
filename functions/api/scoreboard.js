const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const upstream = new URL(ESPN_SCOREBOARD_URL);

  for (const [key, value] of requestUrl.searchParams.entries()) {
    upstream.searchParams.set(key, value);
  }

  const response = await fetch(upstream.toString(), {
    headers: {
      accept: "application/json",
    },
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json",
      "cache-control": "public, max-age=20",
    },
  });
}
