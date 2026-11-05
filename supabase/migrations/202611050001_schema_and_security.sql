create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.tournaments (
  id uuid primary key default extensions.gen_random_uuid(),
  external_key text not null unique,
  name text not null,
  description text,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  start_date date,
  duration_days integer not null default 5 check (duration_days = 5),
  match_duration_minutes integer not null default 10 check (match_duration_minutes = 10),
  timezone text not null default 'Africa/Casablanca',
  champion_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default extensions.gen_random_uuid(),
  external_key text not null,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  username text not null check (length(btrim(username)) between 1 and 80),
  normalized_username text not null,
  status text not null default 'active' check (status in ('active','eliminated','withdrawn','champion','substitute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, external_key),
  unique (tournament_id, normalized_username)
);

alter table public.tournaments drop constraint if exists tournaments_champion_id_fkey;
alter table public.tournaments add constraint tournaments_champion_id_fkey foreign key (champion_id) references public.players(id) on delete set null;

create table if not exists public.matches (
  id uuid primary key default extensions.gen_random_uuid(),
  external_key text not null,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_number integer not null check (match_number between 1 and 57),
  round_number integer not null check (round_number between 1 and 6),
  round_match_number integer not null check (round_match_number > 0),
  player1_id uuid references public.players(id) on delete restrict,
  player2_id uuid references public.players(id) on delete restrict,
  player1_source_match_id uuid references public.matches(id) on delete restrict deferrable initially deferred,
  player2_source_match_id uuid references public.matches(id) on delete restrict deferrable initially deferred,
  winner_id uuid references public.players(id) on delete restrict,
  loser_id uuid references public.players(id) on delete restrict,
  player1_score integer check (player1_score >= 0),
  player2_score integer check (player2_score >= 0),
  tiebreak_winner_id uuid references public.players(id) on delete restrict,
  tiebreak_method text,
  result_type text check (result_type is null or result_type in ('normal','walkover')),
  absent_player_id uuid references public.players(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','scheduled','in_progress','completed','postponed','cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes integer not null default 10 check (duration_minutes = 10),
  station text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, external_key),
  unique (tournament_id, match_number),
  unique (tournament_id, round_number, round_match_number),
  check (player1_id is null or player2_id is null or player1_id <> player2_id),
  check (winner_id is null or winner_id = player1_id or winner_id = player2_id),
  check (loser_id is null or loser_id = player1_id or loser_id = player2_id),
  check (winner_id is null or loser_id is null or winner_id <> loser_id),
  check (tiebreak_winner_id is null or tiebreak_winner_id = player1_id or tiebreak_winner_id = player2_id),
  check (absent_player_id is null or absent_player_id = player1_id or absent_player_id = player2_id)
);

create table if not exists public.match_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists players_tournament_idx on public.players(tournament_id);
create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists matches_round_idx on public.matches(tournament_id, round_number);
create index if not exists matches_status_idx on public.matches(tournament_id, status);
create index if not exists matches_scheduled_idx on public.matches(tournament_id, scheduled_at) where scheduled_at is not null;
create index if not exists match_events_tournament_idx on public.match_events(tournament_id, created_at desc);
create index if not exists match_events_match_idx on public.match_events(match_id);

create or replace function public.is_tournament_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from private.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_tournament_admin() from public;
grant execute on function public.is_tournament_admin() to anon, authenticated;

create or replace function private.require_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from private.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists tournaments_updated_at on public.tournaments;
create trigger tournaments_updated_at before update on public.tournaments for each row execute function private.set_updated_at();
drop trigger if exists players_updated_at on public.players;
create trigger players_updated_at before update on public.players for each row execute function private.set_updated_at();
drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at before update on public.matches for each row execute function private.set_updated_at();

alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;

drop policy if exists "public tournament read" on public.tournaments;
create policy "public tournament read" on public.tournaments for select to anon, authenticated using (true);
drop policy if exists "public player read" on public.players;
create policy "public player read" on public.players for select to anon, authenticated using (true);
drop policy if exists "public match read" on public.matches;
create policy "public match read" on public.matches for select to anon, authenticated using (true);
drop policy if exists "admin event read" on public.match_events;
create policy "admin event read" on public.match_events for select to authenticated using ((select public.is_tournament_admin()));

revoke all on public.tournaments, public.players, public.matches, public.match_events from anon, authenticated;
grant select on public.tournaments, public.players, public.matches to anon, authenticated;
grant select on public.match_events to authenticated;
