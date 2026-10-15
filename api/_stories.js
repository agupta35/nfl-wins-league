import { supabaseRequest } from "./_supabase.js";

const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-5.5";

export async function generateWeeklyRecapNarrative(config, recap, options) {
  return generateNarrative(config, "week_past", {
    week: recap.week,
    weeklyResults: recap.recap_data.weekly,
    standings: recap.recap_data.standings,
    insights: recap.recap_data.insights,
  }, options);
}

export async function generateSeasonStory(config, season, week, standings, options) {
  return generateNarrative(config, "season", { season, week, standings }, options);
}

export async function generateNarrative(config, storyType, facts, { throwOnError = false } = {}) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return handleGenerationError(new Error("AI Gateway key is not configured"), throwOnError);

  try {
    const context = await loadStoryContext(config);
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.75,
        max_tokens: 320,
        reasoning: { effort: "none" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are The Commish, issuing scheduled stories for a private NFL wins league. Return strict JSON only with a short headline (max 8 words) and a body (2 or 3 sentences, max 80 words). Your voice is ruthless, unhinged, theatrical, and fully invested: issue verdicts, expose roster malpractice, keep receipts, call out collapses and lucky breaks, and use supplied running bits when relevant. Never sound diplomatic, soothing, corporate, or neutral. You may call an obviously bad roster decision idiotic, criminal, fraudulent, a disaster, or an active crime scene when grounded in the facts. Attack the pick, the luck, or the football misery, not unrelated personal traits. You may make betting-style calls using only supplied odds, but never say an outcome is guaranteed. Use the League Bible for personality, but only the supplied facts for results, schedule, odds, standings, and streaks. Do not mention draft steals, injury news, or facts not in the input. No threats, slurs, or protected-trait attacks.",
          },
          {
            role: "user",
            content: JSON.stringify({ storyType, leagueBible: context, facts }),
          },
        ],
      }),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`AI Gateway ${response.status}: ${responseText.slice(0, 400)}`);
    const result = JSON.parse(responseText);
    const narrative = parseNarrative(result.choices?.[0]?.message?.content);
    if (!narrative) throw new Error("AI Gateway returned no usable Commish text");
    return narrative;
  } catch (error) {
    return handleGenerationError(error, throwOnError);
  }
}

export async function saveStory(config, { season, week, storyType, headline, body, facts }) {
  await supabaseRequest(config, "/rest/v1/league_stories?on_conflict=season,week,story_type", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        season,
        week,
        story_type: storyType,
        headline,
        body,
        facts,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]),
  });
}

async function loadStoryContext(config) {
  const response = await supabaseRequest(config, "/rest/v1/league_story_context?select=voice,owner_profiles,league_notes&id=eq.true");
  const [context] = await response.json();
  return context || { voice: "Competitive and concise.", owner_profiles: {}, league_notes: [] };
}

function parseNarrative(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || "").join(" ")
    : typeof content === "string"
      ? content
      : "";
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { headline: "Commish Ruling", body: cleanText(text, 600) };
  try {
    const parsed = JSON.parse(match[0]);
    const headline = cleanText(parsed.headline, 90);
    const body = cleanText(parsed.body, 600);
    return headline && body ? { headline, body } : null;
  } catch {
    return { headline: "Commish Ruling", body: cleanText(text, 600) };
  }
}

function cleanText(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function handleGenerationError(error, throwOnError) {
  const message = error instanceof Error ? error.message : "Unknown AI Gateway error";
  console.error(`Story generation failed: ${message}`);
  if (throwOnError) throw new Error(message);
  return null;
}
