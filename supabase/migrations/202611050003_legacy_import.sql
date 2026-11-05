create or replace function public.admin_import_tournament_snapshot(p_snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tournament public.tournaments%rowtype;
  v_player jsonb; v_match jsonb; v_db_player uuid; v_db_match uuid;
  v_source_number integer; v_source_id uuid; v_hash text;
  v_player1 uuid; v_player2 uuid; v_winner uuid; v_loser uuid; v_tiebreak uuid; v_absent uuid;
begin
  perform private.require_admin();
  if jsonb_typeof(p_snapshot) <> 'object' or (p_snapshot->>'schemaVersion')::integer <> 1 then
    raise exception 'Unsupported snapshot schema';
  end if;
  if jsonb_array_length(p_snapshot->'matches') <> 57 or jsonb_array_length(p_snapshot->'players') < 58 then
    raise exception 'Snapshot must contain 57 matches and at least 58 players';
  end if;
  if (select count(distinct (item->>'number')::integer) from jsonb_array_elements(p_snapshot->'matches') item) <> 57 then
    raise exception 'Snapshot contains duplicate match numbers';
  end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=1) <> 29
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=2) <> 13
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=3) <> 8
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=4) <> 4
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=5) <> 2
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') item where (item->>'round')::integer=6) <> 1
    then raise exception 'Snapshot bracket round counts are invalid';
  end if;

  select * into v_tournament from public.tournaments where external_key='1337-fifa-2026' for update;
  if not found then raise exception 'Tournament has not been seeded'; end if;
  v_hash := encode(extensions.digest(convert_to(p_snapshot::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.match_events where tournament_id=v_tournament.id and event_type='legacy_snapshot_imported' and new_data->>'import_hash'=v_hash) then
    raise exception 'This snapshot has already been imported';
  end if;

  create temporary table import_players(legacy_id text primary key, db_id uuid not null) on commit drop;
  create temporary table import_matches(legacy_id text primary key, match_number integer not null unique, db_id uuid not null) on commit drop;

  for v_player in select value from jsonb_array_elements(p_snapshot->'players') loop
    select id into v_db_player from public.players
      where tournament_id=v_tournament.id and normalized_username=lower(btrim(v_player->>'username'));
    if v_db_player is null then
      insert into public.players(external_key,tournament_id,username,normalized_username,status,created_at)
      values('import-'||(v_player->>'id'),v_tournament.id,btrim(v_player->>'username'),lower(btrim(v_player->>'username')),
        coalesce(v_player->>'status','substitute'),coalesce((v_player->>'createdAt')::timestamptz,now()))
      returning id into v_db_player;
    else
      update public.players set username=btrim(v_player->>'username'),status=coalesce(v_player->>'status','active') where id=v_db_player;
    end if;
    insert into import_players values(v_player->>'id',v_db_player);
  end loop;
  update public.players p set status='withdrawn'
    where p.tournament_id=v_tournament.id and not exists(select 1 from import_players i where i.db_id=p.id);

  for v_match in select value from jsonb_array_elements(p_snapshot->'matches') loop
    select id into v_db_match from public.matches
      where tournament_id=v_tournament.id and match_number=(v_match->>'number')::integer;
    if v_db_match is null then raise exception 'Database match M% is missing',v_match->>'number'; end if;
    insert into import_matches values(v_match->>'id',(v_match->>'number')::integer,v_db_match);
  end loop;

  for v_match in select value from jsonb_array_elements(p_snapshot->'matches') order by (value->>'number')::integer loop
    select db_id into v_db_match from import_matches where legacy_id=v_match->>'id';
    select db_id into v_player1 from import_players where legacy_id=v_match->>'player1Id';
    select db_id into v_player2 from import_players where legacy_id=v_match->>'player2Id';
    select db_id into v_winner from import_players where legacy_id=v_match->>'winnerId';
    select db_id into v_loser from import_players where legacy_id=v_match->>'loserId';
    select db_id into v_tiebreak from import_players where legacy_id=v_match->>'tiebreakWinnerId';
    select db_id into v_absent from import_players where legacy_id=v_match->>'absentPlayerId';

    v_source_id := null;
    if v_match->'player1Source' is not null and jsonb_typeof(v_match->'player1Source')='object' then
      select db_id into v_source_id from import_matches where legacy_id=v_match->'player1Source'->>'matchId';
    end if;
    update public.matches set player1_source_match_id=v_source_id where id=v_db_match;
    v_source_id := null;
    if v_match->'player2Source' is not null and jsonb_typeof(v_match->'player2Source')='object' then
      select db_id into v_source_id from import_matches where legacy_id=v_match->'player2Source'->>'matchId';
    end if;
    update public.matches set
      round_number=(v_match->>'round')::integer,round_match_number=(v_match->>'roundMatch')::integer,
      player1_id=v_player1,player2_id=v_player2,player2_source_match_id=v_source_id,
      winner_id=v_winner,loser_id=v_loser,
      player1_score=case when v_match->>'player1Score' is null then null else (v_match->>'player1Score')::integer end,
      player2_score=case when v_match->>'player2Score' is null then null else (v_match->>'player2Score')::integer end,
      tiebreak_winner_id=v_tiebreak,tiebreak_method=nullif(v_match->>'tiebreakMethod',''),
      result_type=nullif(v_match->>'resultType',''),absent_player_id=v_absent,
      status=v_match->>'status',
      scheduled_at=case when v_match->>'scheduledAt' is null then null else (v_match->>'scheduledAt')::timestamptz end,
      completed_at=case when v_match->>'completedAt' is null then null else (v_match->>'completedAt')::timestamptz end,
      station=nullif(v_match->>'station',''),notes=nullif(v_match->>'notes','')
    where id=v_db_match;
  end loop;

  if exists(
    select participant from (
      select player1_id participant from public.matches where tournament_id=v_tournament.id and status<>'completed' and player1_id is not null
      union all
      select player2_id from public.matches where tournament_id=v_tournament.id and status<>'completed' and player2_id is not null
    ) active group by participant having count(*)>1
  ) then raise exception 'Snapshot places a player in multiple active bracket positions'; end if;

  update public.tournaments set
    name=btrim(p_snapshot->'meta'->>'name'),description=p_snapshot->'meta'->>'description',
    start_date=case when p_snapshot->'meta'->>'startDate' is null then null else (p_snapshot->'meta'->>'startDate')::date end,
    status=coalesce(p_snapshot->'meta'->>'status','active')
  where id=v_tournament.id;
  perform private.recompute_tournament(v_tournament.id);
  perform private.audit_event(v_tournament.id,null,'legacy_snapshot_imported',
    jsonb_build_object('updated_at',v_tournament.updated_at,'champion_id',v_tournament.champion_id),
    jsonb_build_object('import_hash',v_hash,'players',jsonb_array_length(p_snapshot->'players'),
      'matches',57,'description','Validated legacy tournament snapshot imported'));
end;
$$;

revoke all on function public.admin_import_tournament_snapshot(jsonb) from public;
grant execute on function public.admin_import_tournament_snapshot(jsonb) to authenticated;
