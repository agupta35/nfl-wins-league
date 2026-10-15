create table public.league_admins (
  email text primary key check (email = lower(email)),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.archived_games (
  event_id text primary key,
  season integer not null references public.league_seasons (season) on delete cascade,
  week integer not null check (week between 1 and 18),
  scheduled_at timestamptz not null,
  away_team text not null check (away_team ~ '^[A-Z]{2,3}$'),
  home_team text not null check (home_team ~ '^[A-Z]{2,3}$'),
  away_score integer not null default 0,
  home_score integer not null default 0,
  completed boolean not null default false,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index archived_games_season_week_idx on public.archived_games (season, week);

create table public.weekly_standings_snapshots (
  season integer not null references public.league_seasons (season) on delete cascade,
  week integer not null check (week between 1 and 18),
  owner_name text not null,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  rank integer not null check (rank > 0),
  captured_at timestamptz not null default now(),
  primary key (season, week, owner_name)
);

create table public.weekly_recaps (
  season integer not null references public.league_seasons (season) on delete cascade,
  week integer not null check (week between 1 and 18),
  title text not null,
  summary text not null,
  winner_name text,
  recap_data jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season, week)
);

alter table public.league_admins enable row level security;
alter table public.archived_games enable row level security;
alter table public.weekly_standings_snapshots enable row level security;
alter table public.weekly_recaps enable row level security;

create policy "Archived games are publicly readable"
  on public.archived_games for select using (true);

create policy "Standings snapshots are publicly readable"
  on public.weekly_standings_snapshots for select using (true);

create policy "Published recaps are publicly readable"
  on public.weekly_recaps for select using (published = true);

create or replace function public.replace_season_roster(target_season integer, roster jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.league_seasons (season, regular_season_only)
  values (target_season, true)
  on conflict (season) do update set regular_season_only = excluded.regular_season_only;

  delete from public.season_rosters where season = target_season;

  insert into public.season_rosters (season, owner_name, team_abbreviation)
  select target_season, owner_name, team_abbreviation
  from jsonb_to_recordset(roster) as rows(owner_name text, team_abbreviation text);
end;
$$;

revoke all on function public.replace_season_roster(integer, jsonb) from public;
grant execute on function public.replace_season_roster(integer, jsonb) to service_role;
