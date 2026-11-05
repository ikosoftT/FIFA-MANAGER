import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Match, Player, TournamentState } from "@/types/tournament";

type TournamentRow = {
  id: string; external_key: string; name: string; description: string | null;
  status: "upcoming" | "active" | "completed"; format: string; start_date: string | null;
  duration_days: number; match_duration_minutes: number; timezone: string;
  updated_at: string; champion_id: string | null;
};
type PlayerRow = {
  id: string; username: string; status: Player["status"]; created_at: string;
};
type MatchRow = {
  id: string; external_key: string; match_number: number; round_number: number;
  round_match_number: number; player1_id: string | null; player2_id: string | null;
  player1_source_match_id: string | null; player2_source_match_id: string | null;
  winner_id: string | null; loser_id: string | null; player1_score: number | null;
  player2_score: number | null; tiebreak_winner_id: string | null;
  tiebreak_method: string | null; result_type: "normal" | "walkover" | null;
  absent_player_id: string | null; status: Match["status"]; scheduled_at: string | null;
  completed_at: string | null; duration_minutes: number; station: string | null; notes: string | null;
};
type EventRow = {
  id: string; match_id: string | null; event_type: string; new_data: Record<string, unknown> | null; created_at: string;
};

function sourceKind(match: MatchRow, source: MatchRow | undefined): "match" | "bye" {
  return source?.round_number === 1 && match.round_number === 3 ? "bye" : "match";
}

export async function getTournamentState(supabase: SupabaseClient): Promise<TournamentState> {
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments").select("*").eq("external_key", "1337-fifa-2026").maybeSingle<TournamentRow>();
  if (tournamentError) throw tournamentError;
  if (!tournament) throw new Error("Tournament has not been seeded. Apply supabase/seed.sql.");

  const [{ data: playerRows, error: playerError }, { data: matchRows, error: matchError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      supabase.from("players").select("*").eq("tournament_id", tournament.id).order("created_at"),
      supabase.from("matches").select("*").eq("tournament_id", tournament.id).order("match_number"),
      supabase.from("match_events").select("id,match_id,event_type,new_data,created_at").eq("tournament_id", tournament.id).order("created_at", { ascending: false }).limit(100),
    ]);
  if (playerError) throw playerError;
  if (matchError) throw matchError;
  // Public RLS deliberately hides audit events. Treat that as an empty public history.
  const rows = (matchRows ?? []) as MatchRow[];
  const byId = new Map(rows.map(row => [row.id, row]));
  const players: Player[] = ((playerRows ?? []) as PlayerRow[]).map(row => ({
    id: row.id, username: row.username, status: row.status, createdAt: row.created_at,
  }));
  const matches: Match[] = rows.map(row => ({
    id: row.id, number: row.match_number, round: row.round_number, roundMatch: row.round_match_number,
    player1Id: row.player1_id, player2Id: row.player2_id,
    player1Source: row.player1_source_match_id ? { kind: sourceKind(row, byId.get(row.player1_source_match_id)), matchId: row.player1_source_match_id } : null,
    player2Source: row.player2_source_match_id ? { kind: sourceKind(row, byId.get(row.player2_source_match_id)), matchId: row.player2_source_match_id } : null,
    winnerId: row.winner_id, loserId: row.loser_id, player1Score: row.player1_score,
    player2Score: row.player2_score, tiebreakWinnerId: row.tiebreak_winner_id,
    tiebreakMethod: row.tiebreak_method, resultType: row.result_type,
    absentPlayerId: row.absent_player_id, status: row.status, scheduledAt: row.scheduled_at,
    completedAt: row.completed_at, durationMinutes: 10, station: row.station ?? "", notes: row.notes ?? "",
  }));
  const history = eventError ? [] : ((eventRows ?? []) as EventRow[]).map(event => ({
    id: event.id, at: event.created_at, type: event.event_type,
    description: typeof event.new_data?.description === "string" ? event.new_data.description : event.event_type.replaceAll("_", " "),
    matchId: event.match_id ?? undefined,
  }));
  return {
    schemaVersion: 1,
    meta: {
      id: tournament.id, name: tournament.name, description: tournament.description ?? "",
      format: "Single Elimination", status: tournament.status, startDate: tournament.start_date,
      durationDays: 5, timezone: "Africa/Casablanca", snapshotVersion: tournament.updated_at, updatedAt: tournament.updated_at,
    },
    players, matches, history, championId: tournament.champion_id, localModified: false,
  };
}
