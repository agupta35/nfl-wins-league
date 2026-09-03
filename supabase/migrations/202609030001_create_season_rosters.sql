create table public.league_seasons (
  season integer primary key check (season between 2000 and 2100),
  regular_season_only boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.season_rosters (
  season integer not null references public.league_seasons (season) on delete cascade,
  owner_name text not null check (char_length(trim(owner_name)) > 0),
  team_abbreviation text not null check (team_abbreviation ~ '^[A-Z]{2,3}$'),
  created_at timestamptz not null default now(),
  primary key (season, team_abbreviation)
);

alter table public.league_seasons enable row level security;
alter table public.season_rosters enable row level security;

create policy "Season data is publicly readable"
  on public.league_seasons for select using (true);

create policy "Season rosters are publicly readable"
  on public.season_rosters for select using (true);

insert into public.league_seasons (season)
values (2024), (2025), (2026)
on conflict (season) do nothing;

with roster (owner_name, team_abbreviation) as (
  values
    ('Carlton', 'DET'), ('Carlton', 'HOU'), ('Carlton', 'GB'), ('Carlton', 'TB'), ('Carlton', 'CAR'), ('Carlton', 'LV'),
    ('A-Rod', 'BUF'), ('A-Rod', 'CIN'), ('A-Rod', 'PHI'), ('A-Rod', 'PIT'), ('A-Rod', 'IND'), ('A-Rod', 'CLE'),
    ('Logan', 'LAR'), ('Logan', 'DEN'), ('Logan', 'SF'), ('Logan', 'JAX'), ('Logan', 'NO'), ('Logan', 'NYJ'),
    ('Jared', 'BAL'), ('Jared', 'DAL'), ('Jared', 'CHI'), ('Jared', 'MIN'), ('Jared', 'NYG'), ('Jared', 'ATL'),
    ('Ash', 'SEA'), ('Ash', 'NE'), ('Ash', 'KC'), ('Ash', 'LAC'), ('Ash', 'WSH'), ('Ash', 'TEN')
)
insert into public.season_rosters (season, owner_name, team_abbreviation)
select season, owner_name, team_abbreviation
from roster
cross join (values (2024), (2025), (2026)) as years (season)
on conflict (season, team_abbreviation) do update set owner_name = excluded.owner_name;
