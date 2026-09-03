import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/scoreboard") {
      await proxyScoreboard(url, response);
      return;
    }

    await serveStatic(url, response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Server error");
  }
}).listen(PORT, () => {
  console.log(`NFL Wins Pool Arena running at http://localhost:${PORT}`);
});

async function proxyScoreboard(url, response) {
  const upstream = new URL(ESPN_SCOREBOARD_URL);
  for (const [key, value] of url.searchParams.entries()) {
    upstream.searchParams.set(key, value);
  }

  const espnResponse = await fetch(upstream.toString(), {
    headers: { accept: "application/json" },
  });
  const body = await espnResponse.text();

  response.writeHead(espnResponse.status, {
    "content-type": espnResponse.headers.get("content-type") || "application/json",
    "cache-control": "no-store",
  });
  response.end(body);
}

async function serveStatic(url, response) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const file = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
  });
  response.end(file);
}
