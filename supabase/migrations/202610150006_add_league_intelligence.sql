create table public.league_story_candidates (
  season integer not null references public.league_seasons (season) on delete cascade,
  week integer not null check (week between 1 and 18),
  candidate_key text not null,
  candidate_type text not null,
  owners jsonb not null default '[]'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  impact_score integer not null check (impact_score between 0 and 100),
  novelty_score integer not null check (novelty_score between 0 and 100),
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season, week, candidate_key)
);

create index league_story_candidates_editorial_idx
  on public.league_story_candidates (season, week, selected, impact_score desc);

create table public.league_storylines (
  season integer not null references public.league_seasons (season) on delete cascade,
  storyline_key text not null,
  storyline_type text not null,
  owners jsonb not null default '[]'::jsonb,
  status text not null default 'developing' check (status in ('developing', 'dormant', 'resolved')),
  started_week integer not null check (started_week between 1 and 18),
  last_covered_week integer not null check (last_covered_week between 1 and 18),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season, storyline_key)
);

create index league_storylines_current_idx
  on public.league_storylines (season, status, last_covered_week desc);

alter table public.league_story_candidates enable row level security;
alter table public.league_storylines enable row level security;

create policy "League story candidates are publicly readable"
  on public.league_story_candidates for select using (true);

create policy "League storylines are publicly readable"
  on public.league_storylines for select using (true);
