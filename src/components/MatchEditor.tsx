"use client";

import { useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { Match } from "@/types/tournament";
import { useTournament } from "@/hooks/useTournament";
import { player } from "@/lib/tournament-engine";

const ZONE = "Africa/Casablanca";

export function MatchEditor({ match, onClose }: { match: Match; onClose: () => void }) {
  const { state, mutate } = useTournament();
  const [a, setA] = useState(String(match.player1Score ?? ""));
  const [b, setB] = useState(String(match.player2Score ?? ""));
  const [tie, setTie] = useState(match.tiebreakWinnerId ?? "");
  const [method, setMethod] = useState(match.tiebreakMethod ?? "");
  const [at, setAt] = useState(match.scheduledAt ? formatInTimeZone(match.scheduledAt, ZONE, "yyyy-MM-dd'T'HH:mm") : "");
  const [station, setStation] = useState(match.station);
  const [overrideWindow, setOverrideWindow] = useState(false);
  const [old, setOld] = useState(match.player1Id ?? "");
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const run = async (operation: () => Promise<void>) => {
    setError(""); setPending(true);
    try { await operation(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setPending(false); }
  };
  const eligible = state.players.filter(candidate =>
    !state.matches.some(item => item.status !== "completed" && (item.player1Id === candidate.id || item.player2Id === candidate.id))
    && candidate.id !== match.player1Id && candidate.id !== match.player2Id,
  );

  return <div className="modal" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="panel modal-card">
      <h2>Edit M{String(match.number).padStart(2, "0")}</h2>
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      <h3>Schedule</h3>
      <div className="toolbar">
        <input type="datetime-local" className="input" value={at} onChange={event => setAt(event.target.value)} />
        <input className="input" placeholder="Station" value={station} onChange={event => setStation(event.target.value)} />
        <button className="btn" disabled={pending} onClick={() => void run(() => mutate({
          action: "schedule",
          payload: { matchId: match.id, scheduledAt: at ? fromZonedTime(at, ZONE).toISOString() : null, station, override: overrideWindow },
        }))}>Save schedule</button>
      </div>
      <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={overrideWindow} onChange={event => setOverrideWindow(event.target.checked)} />Allow an explicitly confirmed time outside the five-day window</label>

      <h3>Result</h3>
      <div className="toolbar">
        <input type="number" min="0" className="input" placeholder={(player(state, match.player1Id)?.username ?? "Player 1") + " score"} value={a} onChange={event => setA(event.target.value)} />
        <input type="number" min="0" className="input" placeholder={(player(state, match.player2Id)?.username ?? "Player 2") + " score"} value={b} onChange={event => setB(event.target.value)} />
      </div>
      <select className="input" value={tie} onChange={event => setTie(event.target.value)}>
        <option value="">Tiebreak winner (only for draw)</option>
        {[match.player1Id, match.player2Id].filter(Boolean).map(id => <option value={id!} key={id}>{player(state, id)?.username}</option>)}
      </select>
      <input className="input" style={{ marginTop: 8 }} placeholder="Tiebreak method, e.g. penalties" value={method} onChange={event => setMethod(event.target.value)} />
      <div className="toolbar">
        <button className="btn primary" disabled={pending || !match.player1Id || !match.player2Id || a === "" || b === ""} onClick={() => void run(() => mutate({
          action: "recordResult", payload: {
            matchId: match.id, player1Score: Number(a), player2Score: Number(b),
            tiebreakWinnerId: tie || undefined, tiebreakMethod: method || undefined,
          },
        }))}>Confirm result</button>
        {[match.player1Id, match.player2Id].filter(Boolean).map(id => <button className="btn" disabled={pending} key={id} onClick={() => {
          if (confirm("Award this walkover?")) void run(() => mutate({ action: "walkover", payload: { matchId: match.id, winnerId: id! } }));
        }}>W.O. {player(state, id)?.username}</button>)}
        {match.status === "completed" && <button className="btn danger" disabled={pending} onClick={() => {
          if (confirm("Revert this result?")) void run(() => mutate({ action: "revertResult", payload: { matchId: match.id } }));
        }}>Revert result</button>}
      </div>

      <h3>Replace player</h3>
      <div className="toolbar">
        <select className="input" value={old} onChange={event => setOld(event.target.value)}>
          {[match.player1Id, match.player2Id].filter(Boolean).map(id => <option value={id!} key={id}>{player(state, id)?.username}</option>)}
        </select>
        <select className="input" value={replacement} onChange={event => setReplacement(event.target.value)}>
          <option value="">Select eligible substitute</option>
          {eligible.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.username}</option>)}
        </select>
        <button className="btn" disabled={pending || !replacement} onClick={() => {
          if (confirm("Confirm player replacement?")) void run(() => mutate({ action: "replacePlayer", payload: { matchId: match.id, oldPlayerId: old, newPlayerId: replacement } }));
        }}>Replace</button>
      </div>
      <button className="btn" disabled={pending} onClick={onClose}>Close</button>
    </div>
  </div>;
}
