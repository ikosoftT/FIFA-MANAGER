export type MatchStatus = "pending" | "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
export type ResultType = "normal" | "walkover" | null;
export type PlayerStatus = "active" | "eliminated" | "withdrawn" | "champion" | "substitute";

export interface Player { id: string; username: string; status: PlayerStatus; createdAt: string }
export interface SlotSource { kind: "match" | "bye"; matchId: string }
export interface Match {
  id: string; number: number; round: number; roundMatch: number;
  player1Id: string | null; player2Id: string | null;
  player1Source: SlotSource | null; player2Source: SlotSource | null;
  winnerId: string | null; loserId: string | null;
  player1Score: number | null; player2Score: number | null;
  tiebreakWinnerId: string | null; tiebreakMethod: string | null;
  resultType: ResultType; absentPlayerId: string | null; status: MatchStatus;
  scheduledAt: string | null; completedAt: string | null; durationMinutes: 10;
  station: string; notes: string;
}
export interface HistoryEvent { id: string; at: string; type: string; description: string; matchId?: string }
export interface TournamentMeta {
  id: string; name: string; description: string; format: "Single Elimination";
  status: "upcoming" | "active" | "completed"; startDate: string | null;
  durationDays: 5; timezone: "Africa/Casablanca"; snapshotVersion: string; updatedAt: string;
}
export interface TournamentState {
  schemaVersion: 1; meta: TournamentMeta; players: Player[]; matches: Match[];
  history: HistoryEvent[]; championId: string | null; localModified: boolean;
}
export interface ResultInput { matchId: string; player1Score: number; player2Score: number; tiebreakWinnerId?: string; tiebreakMethod?: string }

