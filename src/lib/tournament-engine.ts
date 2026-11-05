import type { Match, ResultInput, TournamentState } from "@/types/tournament";

export const ROUND_NAMES = ["", "Round 1", "Round 2", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
export const player = (s: TournamentState, id: string | null) => s.players.find(p => p.id === id);
export const matchLabel = (m: Match) => `M${String(m.number).padStart(2, "0")}`;
export const destinationFor = (s: TournamentState, matchId: string) => s.matches.find(m => m.player1Source?.matchId === matchId || m.player2Source?.matchId === matchId);

function clone(s: TournamentState): TournamentState { return structuredClone(s); }
function touch(s: TournamentState, type: string, description: string, matchId?: string) {
  s.meta.updatedAt = new Date().toISOString(); s.localModified = true;
  s.history.unshift({ id: crypto.randomUUID(), at: s.meta.updatedAt, type, description, matchId });
}
function placeWinner(s: TournamentState, sourceId: string, winnerId: string) {
  const dest = destinationFor(s, sourceId); if (!dest) { s.championId = winnerId; return; }
  if (dest.player1Source?.matchId === sourceId) dest.player1Id = winnerId;
  if (dest.player2Source?.matchId === sourceId) dest.player2Id = winnerId;
}
function recomputeStatuses(s: TournamentState) {
  s.players.forEach(p => { if (p.status !== "withdrawn" && p.status !== "substitute") p.status = "active"; });
  s.matches.filter(m => m.status === "completed").forEach(m => { const loser = player(s, m.loserId); if (loser) loser.status = "eliminated"; });
  if (s.championId) { const champ = player(s, s.championId); if (champ) champ.status = "champion"; s.meta.status = "completed"; }
}
function clearDownstream(s: TournamentState, sourceId: string, oldWinner: string | null) {
  const dest = destinationFor(s, sourceId); if (!dest) { s.championId = null; return; }
  if (dest.status === "completed") throw new Error(`${matchLabel(dest)} is already completed. Revert that downstream result first.`);
  if (dest.player1Source?.matchId === sourceId && dest.player1Id === oldWinner) dest.player1Id = null;
  if (dest.player2Source?.matchId === sourceId && dest.player2Id === oldWinner) dest.player2Id = null;
}
export function recordResult(state: TournamentState, input: ResultInput): TournamentState {
  const s = clone(state); const m = s.matches.find(x => x.id === input.matchId); if (!m) throw new Error("Match not found.");
  if (!m.player1Id || !m.player2Id) throw new Error("Both participants must be resolved.");
  if (input.player1Score < 0 || input.player2Score < 0 || !Number.isInteger(input.player1Score) || !Number.isInteger(input.player2Score)) throw new Error("Scores must be non-negative whole numbers.");
  let winnerId: string;
  if (input.player1Score === input.player2Score) {
    if (![m.player1Id, m.player2Id].includes(input.tiebreakWinnerId ?? "") || !input.tiebreakMethod?.trim()) throw new Error("A tied score requires a participant and tiebreak method.");
    winnerId = input.tiebreakWinnerId!;
  } else winnerId = input.player1Score > input.player2Score ? m.player1Id : m.player2Id;
  if (m.status === "completed") { if (m.winnerId === winnerId && m.player1Score === input.player1Score && m.player2Score === input.player2Score) throw new Error("This result is already confirmed."); clearDownstream(s, m.id, m.winnerId); }
  m.player1Score = input.player1Score; m.player2Score = input.player2Score; m.tiebreakWinnerId = input.tiebreakWinnerId ?? null; m.tiebreakMethod = input.tiebreakMethod?.trim() || null; m.winnerId = winnerId; m.loserId = winnerId === m.player1Id ? m.player2Id : m.player1Id; m.resultType = "normal"; m.absentPlayerId = null; m.status = "completed"; m.completedAt = new Date().toISOString();
  placeWinner(s, m.id, winnerId); recomputeStatuses(s); touch(s, "result", `${matchLabel(m)} result confirmed`, m.id); return s;
}
export function awardWalkover(state: TournamentState, matchId: string, winnerId: string): TournamentState {
  const s = clone(state); const m = s.matches.find(x => x.id === matchId); if (!m || !m.player1Id || !m.player2Id) throw new Error("Match participants are unresolved.");
  if (m.status === "completed") throw new Error("Revert the existing result first."); if (![m.player1Id, m.player2Id].includes(winnerId)) throw new Error("Winner must be a participant.");
  m.winnerId = winnerId; m.loserId = winnerId === m.player1Id ? m.player2Id : m.player1Id; m.absentPlayerId = m.loserId; m.resultType = "walkover"; m.status = "completed"; m.completedAt = new Date().toISOString(); placeWinner(s, m.id, winnerId); recomputeStatuses(s); touch(s, "walkover", `${player(s,winnerId)?.username} won ${matchLabel(m)} by walkover`, m.id); return s;
}
export function revertResult(state: TournamentState, matchId: string): TournamentState {
  const s = clone(state); const m = s.matches.find(x => x.id === matchId); if (!m || m.status !== "completed") throw new Error("No completed result to revert."); clearDownstream(s, m.id, m.winnerId); Object.assign(m, { winnerId:null, loserId:null, player1Score:null, player2Score:null,tiebreakWinnerId:null,tiebreakMethod:null,resultType:null,absentPlayerId:null,status:m.scheduledAt?"scheduled":"pending",completedAt:null }); recomputeStatuses(s); touch(s,"result_reverted",`${matchLabel(m)} result reverted`,m.id); return s;
}
export function scheduleMatch(state:TournamentState, matchId:string, scheduledAt:string|null, station:string, override=false):TournamentState {
  const s=clone(state); const m=s.matches.find(x=>x.id===matchId); if(!m) throw new Error("Match not found."); if(m.status==="completed") throw new Error("Completed matches cannot be rescheduled.");
  if(scheduledAt){ const at=new Date(scheduledAt); if(Number.isNaN(at.valueOf())) throw new Error("Invalid date."); if(s.meta.startDate&&!override){ const start=new Date(`${s.meta.startDate}T00:00:00`); const end=new Date(start); end.setDate(end.getDate()+5); if(at<start||at>=end) throw new Error("This time is outside the five-day tournament window."); } const end=at.valueOf()+600000; for(const x of s.matches){ if(x.id===m.id||!x.scheduledAt||x.status==="cancelled") continue; const xs=new Date(x.scheduledAt).valueOf(), xe=xs+600000; if(at.valueOf()<xe&&end>xs){ const shared=[m.player1Id,m.player2Id].filter(Boolean).some(id=>id===x.player1Id||id===x.player2Id); if(shared) throw new Error(`Player schedule conflicts with ${matchLabel(x)}.`); if(station.trim()&&station.trim().toLowerCase()===x.station.trim().toLowerCase()) throw new Error(`Station conflicts with ${matchLabel(x)}.`); } } }
  m.scheduledAt=scheduledAt; m.station=station.trim(); m.status=scheduledAt?"scheduled":"pending"; touch(s,"schedule",`${matchLabel(m)} schedule updated`,m.id); return s;
}
export function replacePlayer(state:TournamentState,matchId:string,oldId:string,newId:string):TournamentState { const s=clone(state); const m=s.matches.find(x=>x.id===matchId); if(!m) throw new Error("Match not found."); if(m.status==="completed") throw new Error("Revert the result before replacing a player."); if(![m.player1Id,m.player2Id].includes(oldId)) throw new Error("The absent player is not in this match."); if(newId===m.player1Id||newId===m.player2Id) throw new Error("Replacement is already in this match."); const active=s.matches.some(x=>x.status!=="completed"&&(x.player1Id===newId||x.player2Id===newId)); if(active) throw new Error("Replacement already occupies an active bracket slot."); if(m.player1Id===oldId)m.player1Id=newId; else m.player2Id=newId; const old=player(s,oldId); if(old)old.status="withdrawn"; const next=player(s,newId); if(next)next.status="active"; touch(s,"replacement",`${old?.username} replaced by ${next?.username} in ${matchLabel(m)}`,m.id); return s; }
export function stats(s:TournamentState){ const completed=s.matches.filter(m=>m.status==="completed").length; return {completed,total:s.matches.length,remaining:s.matches.length-completed,progress:Math.round(completed/s.matches.length*100),walkovers:s.matches.filter(m=>m.resultType==="walkover").length}; }
