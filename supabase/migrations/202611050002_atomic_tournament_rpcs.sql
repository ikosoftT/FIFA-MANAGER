create or replace function private.audit_event(
  p_tournament_id uuid, p_match_id uuid, p_type text, p_previous jsonb, p_new jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.match_events(tournament_id, match_id, actor_id, event_type, previous_data, new_data)
  values (p_tournament_id, p_match_id, auth.uid(), p_type, p_previous, p_new);
$$;

create or replace function private.recompute_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_champion uuid;
begin
  update public.players p
  set status = case
    when p.status = 'withdrawn' then 'withdrawn'
    when p.status = 'substitute' and not exists (
      select 1 from public.matches m
      where m.tournament_id = p_tournament_id and (m.player1_id = p.id or m.player2_id = p.id)
    ) then 'substitute'
    else 'active'
  end
  where p.tournament_id = p_tournament_id;

  update public.players p set status = 'eliminated'
  where p.tournament_id = p_tournament_id and exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament_id and m.status = 'completed' and m.loser_id = p.id
  );

  select winner_id into v_champion from public.matches
  where tournament_id = p_tournament_id and round_number = 6 and status = 'completed';
  if v_champion is not null then
    update public.players set status = 'champion' where id = v_champion;
    update public.tournaments set champion_id = v_champion, status = 'completed' where id = p_tournament_id;
  else
    update public.tournaments set champion_id = null,
      status = case when status = 'completed' then 'active' else status end
    where id = p_tournament_id;
  end if;
end;
$$;

create or replace function private.clear_advancement(p_source_id uuid, p_old_winner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_destination public.matches%rowtype;
begin
  select * into v_destination from public.matches
  where player1_source_match_id = p_source_id or player2_source_match_id = p_source_id
  for update;
  if not found then return; end if;
  if v_destination.status = 'completed' then
    raise exception '% is already completed. Revert that downstream result first.', v_destination.external_key;
  end if;
  update public.matches set
    player1_id = case when player1_source_match_id = p_source_id and player1_id = p_old_winner then null else player1_id end,
    player2_id = case when player2_source_match_id = p_source_id and player2_id = p_old_winner then null else player2_id end
  where id = v_destination.id;
end;
$$;

create or replace function private.advance_winner(p_source_id uuid, p_winner_id uuid, p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_destination public.matches%rowtype;
begin
  select * into v_destination from public.matches
  where player1_source_match_id = p_source_id or player2_source_match_id = p_source_id
  for update;
  if not found then
    update public.tournaments set champion_id = p_winner_id, status = 'completed' where id = p_tournament_id;
    return;
  end if;
  if exists (
    select 1 from public.matches m where m.tournament_id = p_tournament_id
    and m.status <> 'completed' and m.id <> v_destination.id
    and (m.player1_id = p_winner_id or m.player2_id = p_winner_id)
  ) then raise exception 'Winner already occupies another active bracket position'; end if;
  update public.matches set
    player1_id = case when player1_source_match_id = p_source_id then p_winner_id else player1_id end,
    player2_id = case when player2_source_match_id = p_source_id then p_winner_id else player2_id end
  where id = v_destination.id;
end;
$$;

create or replace function public.admin_record_result(
  p_match_id uuid, p_player1_score integer, p_player2_score integer,
  p_tiebreak_winner_id uuid default null, p_tiebreak_method text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_winner uuid; v_loser uuid; v_previous jsonb;
begin
  perform private.require_admin();
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Both participants must be resolved'; end if;
  if p_player1_score < 0 or p_player2_score < 0 then raise exception 'Scores must be non-negative'; end if;
  if p_player1_score = p_player2_score then
    if p_tiebreak_winner_id is null or p_tiebreak_winner_id not in (v_match.player1_id, v_match.player2_id) or nullif(btrim(p_tiebreak_method), '') is null
      then raise exception 'A tied score requires a participant and tiebreak method'; end if;
    v_winner := p_tiebreak_winner_id;
  else v_winner := case when p_player1_score > p_player2_score then v_match.player1_id else v_match.player2_id end;
  end if;
  v_loser := case when v_winner = v_match.player1_id then v_match.player2_id else v_match.player1_id end;
  if v_match.status = 'completed' then
    if v_match.winner_id = v_winner and v_match.player1_score = p_player1_score and v_match.player2_score = p_player2_score
      then raise exception 'This result is already confirmed'; end if;
    perform private.clear_advancement(v_match.id, v_match.winner_id);
  end if;
  v_previous := to_jsonb(v_match);
  update public.matches set player1_score=p_player1_score, player2_score=p_player2_score,
    tiebreak_winner_id=p_tiebreak_winner_id, tiebreak_method=nullif(btrim(p_tiebreak_method),''),
    winner_id=v_winner, loser_id=v_loser, result_type='normal', absent_player_id=null,
    status='completed', completed_at=now()
  where id=v_match.id;
  perform private.advance_winner(v_match.id, v_winner, v_match.tournament_id);
  perform private.recompute_tournament(v_match.tournament_id);
  perform private.audit_event(v_match.tournament_id,v_match.id,
    case when v_match.status='completed' then 'result_corrected' else 'result_submitted' end,
    v_previous, jsonb_build_object('winner_id',v_winner,'player1_score',p_player1_score,'player2_score',p_player2_score,'description',v_match.external_key||' result confirmed'));
end;
$$;

create or replace function public.admin_award_walkover(p_match_id uuid, p_winner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_loser uuid;
begin
  perform private.require_admin();
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status='completed' then raise exception 'Revert the existing result first'; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Match participants are unresolved'; end if;
  if p_winner_id not in (v_match.player1_id,v_match.player2_id) then raise exception 'Winner must be a participant'; end if;
  v_loser := case when p_winner_id=v_match.player1_id then v_match.player2_id else v_match.player1_id end;
  update public.matches set winner_id=p_winner_id,loser_id=v_loser,absent_player_id=v_loser,
    player1_score=null,player2_score=null,tiebreak_winner_id=null,tiebreak_method=null,
    result_type='walkover',status='completed',completed_at=now() where id=v_match.id;
  perform private.advance_winner(v_match.id,p_winner_id,v_match.tournament_id);
  perform private.recompute_tournament(v_match.tournament_id);
  perform private.audit_event(v_match.tournament_id,v_match.id,'walkover_awarded',to_jsonb(v_match),
    jsonb_build_object('winner_id',p_winner_id,'absent_player_id',v_loser,'description',v_match.external_key||' awarded by walkover'));
end;
$$;

create or replace function public.admin_revert_result(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype;
begin
  perform private.require_admin();
  select * into v_match from public.matches where id=p_match_id for update;
  if not found or v_match.status<>'completed' then raise exception 'No completed result to revert'; end if;
  perform private.clear_advancement(v_match.id,v_match.winner_id);
  update public.matches set winner_id=null,loser_id=null,player1_score=null,player2_score=null,
    tiebreak_winner_id=null,tiebreak_method=null,result_type=null,absent_player_id=null,
    status=case when scheduled_at is null then 'pending' else 'scheduled' end,completed_at=null
  where id=v_match.id;
  perform private.recompute_tournament(v_match.tournament_id);
  perform private.audit_event(v_match.tournament_id,v_match.id,'result_reverted',to_jsonb(v_match),
    jsonb_build_object('description',v_match.external_key||' result reverted'));
end;
$$;

create or replace function public.admin_schedule_match(
  p_match_id uuid, p_scheduled_at timestamptz, p_station text default '', p_override_window boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_tournament public.tournaments%rowtype; v_conflict text;
begin
  perform private.require_admin();
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status='completed' then raise exception 'Completed matches cannot be rescheduled'; end if;
  select * into v_tournament from public.tournaments where id=v_match.tournament_id;
  if p_scheduled_at is not null then
    if v_tournament.start_date is not null and not p_override_window and
      ((p_scheduled_at at time zone v_tournament.timezone)::date < v_tournament.start_date or
       (p_scheduled_at at time zone v_tournament.timezone)::date >= v_tournament.start_date + v_tournament.duration_days)
      then raise exception 'This time is outside the five-day tournament window'; end if;
    select m.external_key into v_conflict from public.matches m
    where m.tournament_id=v_match.tournament_id and m.id<>v_match.id and m.scheduled_at is not null and m.status<>'cancelled'
      and tstzrange(m.scheduled_at,m.scheduled_at+make_interval(mins=>m.duration_minutes),'[)') &&
          tstzrange(p_scheduled_at,p_scheduled_at+interval '10 minutes','[)')
      and ((v_match.player1_id is not null and v_match.player1_id in (m.player1_id,m.player2_id))
        or (v_match.player2_id is not null and v_match.player2_id in (m.player1_id,m.player2_id)))
    limit 1;
    if v_conflict is not null then raise exception 'Player schedule conflicts with %',v_conflict; end if;
    select m.external_key into v_conflict from public.matches m
    where nullif(btrim(p_station),'') is not null and m.tournament_id=v_match.tournament_id and m.id<>v_match.id
      and m.scheduled_at is not null and m.status<>'cancelled' and lower(btrim(m.station))=lower(btrim(p_station))
      and tstzrange(m.scheduled_at,m.scheduled_at+make_interval(mins=>m.duration_minutes),'[)') &&
          tstzrange(p_scheduled_at,p_scheduled_at+interval '10 minutes','[)')
    limit 1;
    if v_conflict is not null then raise exception 'Station conflicts with %',v_conflict; end if;
  end if;
  update public.matches set scheduled_at=p_scheduled_at,station=nullif(btrim(p_station),''),
    status=case when p_scheduled_at is null then 'pending' else 'scheduled' end where id=v_match.id;
  perform private.audit_event(v_match.tournament_id,v_match.id,'match_scheduled',to_jsonb(v_match),
    jsonb_build_object('scheduled_at',p_scheduled_at,'station',p_station,'description',v_match.external_key||' schedule updated'));
end;
$$;

create or replace function public.admin_replace_player(p_match_id uuid,p_old_player_id uuid,p_new_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_old_name text; v_new_name text;
begin
  perform private.require_admin();
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status='completed' then raise exception 'Revert the result before replacing a player'; end if;
  if p_old_player_id not in (v_match.player1_id,v_match.player2_id) then raise exception 'Absent player is not in this match'; end if;
  if p_new_player_id in (v_match.player1_id,v_match.player2_id) then raise exception 'Replacement is already in this match'; end if;
  if not exists(select 1 from public.players where id=p_new_player_id and tournament_id=v_match.tournament_id) then raise exception 'Replacement player not found'; end if;
  if exists(select 1 from public.matches where tournament_id=v_match.tournament_id and status<>'completed' and (player1_id=p_new_player_id or player2_id=p_new_player_id))
    then raise exception 'Replacement already occupies an active bracket slot'; end if;
  select username into v_old_name from public.players where id=p_old_player_id;
  select username into v_new_name from public.players where id=p_new_player_id;
  update public.matches set
    player1_id=case when player1_id=p_old_player_id then p_new_player_id else player1_id end,
    player2_id=case when player2_id=p_old_player_id then p_new_player_id else player2_id end
  where id=v_match.id;
  update public.players set status='withdrawn' where id=p_old_player_id;
  update public.players set status='active' where id=p_new_player_id;
  perform private.audit_event(v_match.tournament_id,v_match.id,'player_replaced',to_jsonb(v_match),
    jsonb_build_object('old_player_id',p_old_player_id,'new_player_id',p_new_player_id,'description',v_old_name||' replaced by '||v_new_name||' in '||v_match.external_key));
end;
$$;

create or replace function public.admin_set_match_status(p_match_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype;
begin
  perform private.require_admin();
  if p_status not in ('in_progress','postponed','cancelled') then raise exception 'Invalid match status'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status='completed' then raise exception 'Revert the completed result first'; end if;
  if p_status='in_progress' and (v_match.player1_id is null or v_match.player2_id is null) then raise exception 'Both players must be resolved before starting'; end if;
  update public.matches set status=p_status,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end where id=v_match.id;
  perform private.audit_event(v_match.tournament_id,v_match.id,'match_status_changed',to_jsonb(v_match),
    jsonb_build_object('status',p_status,'description',v_match.external_key||' marked '||replace(p_status,'_',' ')));
end;
$$;

create or replace function public.admin_add_player(p_username text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid; v_id uuid;
begin
  perform private.require_admin();
  if nullif(btrim(p_username),'') is null then raise exception 'Username is required'; end if;
  select id into v_tournament from public.tournaments where external_key='1337-fifa-2026';
  insert into public.players(external_key,tournament_id,username,normalized_username,status)
  values('sub-'||extensions.gen_random_uuid()::text,v_tournament,btrim(p_username),lower(btrim(p_username)),'substitute')
  returning id into v_id;
  perform private.audit_event(v_tournament,null,'player_added',null,jsonb_build_object('player_id',v_id,'description','Substitute '||btrim(p_username)||' added'));
  return v_id;
end;
$$;

create or replace function public.admin_rename_player(p_player_id uuid,p_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_player public.players%rowtype;
begin
  perform private.require_admin();
  if nullif(btrim(p_username),'') is null then raise exception 'Username is required'; end if;
  select * into v_player from public.players where id=p_player_id for update;
  if not found then raise exception 'Player not found'; end if;
  update public.players set username=btrim(p_username),normalized_username=lower(btrim(p_username)) where id=p_player_id;
  perform private.audit_event(v_player.tournament_id,null,'player_renamed',to_jsonb(v_player),jsonb_build_object('username',btrim(p_username),'description',v_player.username||' renamed to '||btrim(p_username)));
end;
$$;

create or replace function public.admin_update_tournament(p_name text,p_description text,p_start_date date,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament public.tournaments%rowtype;
begin
  perform private.require_admin();
  if nullif(btrim(p_name),'') is null then raise exception 'Tournament name is required'; end if;
  if p_status not in ('upcoming','active','completed') then raise exception 'Invalid tournament status'; end if;
  select * into v_tournament from public.tournaments where external_key='1337-fifa-2026' for update;
  update public.tournaments set name=btrim(p_name),description=p_description,start_date=p_start_date,status=p_status where id=v_tournament.id;
  perform private.audit_event(v_tournament.id,null,'tournament_settings_updated',to_jsonb(v_tournament),jsonb_build_object('name',p_name,'start_date',p_start_date,'status',p_status,'description','Tournament settings updated'));
end;
$$;

revoke all on function public.admin_record_result(uuid,integer,integer,uuid,text) from public;
revoke all on function public.admin_award_walkover(uuid,uuid) from public;
revoke all on function public.admin_revert_result(uuid) from public;
revoke all on function public.admin_schedule_match(uuid,timestamptz,text,boolean) from public;
revoke all on function public.admin_replace_player(uuid,uuid,uuid) from public;
revoke all on function public.admin_set_match_status(uuid,text) from public;
revoke all on function public.admin_add_player(text) from public;
revoke all on function public.admin_rename_player(uuid,text) from public;
revoke all on function public.admin_update_tournament(text,text,date,text) from public;
grant execute on function public.admin_record_result(uuid,integer,integer,uuid,text) to authenticated;
grant execute on function public.admin_award_walkover(uuid,uuid) to authenticated;
grant execute on function public.admin_revert_result(uuid) to authenticated;
grant execute on function public.admin_schedule_match(uuid,timestamptz,text,boolean) to authenticated;
grant execute on function public.admin_replace_player(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_set_match_status(uuid,text) to authenticated;
grant execute on function public.admin_add_player(text) to authenticated;
grant execute on function public.admin_rename_player(uuid,text) to authenticated;
grant execute on function public.admin_update_tournament(text,text,date,text) to authenticated;
