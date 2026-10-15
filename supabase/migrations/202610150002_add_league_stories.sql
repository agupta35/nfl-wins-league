create table public.league_story_context (
  id boolean primary key default true check (id),
  voice text not null,
  owner_profiles jsonb not null default '{}'::jsonb,
  league_notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.league_stories (
  season integer not null references public.league_seasons (season) on delete cascade,
  week integer not null check (week between 0 and 18),
  story_type text not null check (story_type in ('week_ahead', 'in_progress', 'season')),
  headline text not null,
  body text not null,
  facts jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season, week, story_type)
);

alter table public.league_story_context enable row level security;
alter table public.league_stories enable row level security;

create policy "League story context is publicly readable"
  on public.league_story_context for select using (true);

create policy "League stories are publicly readable"
  on public.league_stories for select using (true);

insert into public.league_story_context (id, voice, owner_profiles, league_notes)
values (
  true,
  'Write like the league commissioner in ruthless fireworks mode: sharp, funny, concise, specific, and unapologetically competitive. Roast league results, roster choices, lucky breaks, football fandom, and the supplied running bits. Use only supplied facts for standings, scores, schedules, odds, streaks, and NFL claims. Never invent injuries, personal facts, draft order, or gambling advice. No threats, slurs, or protected-trait attacks. Do not call anyone a draft steal.',
  '{
    "Carlton": "A Houston Texans fan enduring a 1-4 Texans start, a rough Texas A&M run, and a Rockets season that ended before the playoffs. Running league bit: Carlton misses Tony Romo calling NFL games.",
    "A-Rod": "Broncos fan. League reputation: somehow catches every lucky break.",
    "Logan": "Cowboys fan. League reputation: cursed by the Cowboys experience.",
    "Ash": "Bills fan. Loves football and can take result-based banter.",
    "Jared": "Bills fan. Loves football and can take result-based banter."
  }'::jsonb,
  '["Everyone loves football.", "Keep the banter pointed at league outcomes, roster choices, and football fandom. Make it memorable, not soothing."]'::jsonb
)
on conflict (id) do nothing;
