"use client";
import { useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { MatchCard } from "@/components/MatchCard";
import { MatchEditor } from "@/components/MatchEditor";
import { PageHeader } from "@/components/PageHeader";
import type { Match } from "@/types/tournament";

export default function AdminMatches() {
  const { state, mutate } = useTournament();
  const [editing, setEditing] = useState<Match | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const list = state.matches.filter(match => !filter || match.status === filter);
  const status = async (match: Match, value: "in_progress" | "postponed" | "cancelled") => {
    setError("");
    try { await mutate({ action: "status", payload: { matchId: match.id, status: value } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update match."); }
  };
  return <>
    <PageHeader eyebrow="Fixtures & results" title="Manage matches" description="Schedule, score, replace participants, award walkovers, postpone, and safely correct results." />
    {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
    <select className="input" style={{ maxWidth: 260, marginBottom: 18 }} value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="">All statuses</option>
      {["pending", "scheduled", "in_progress", "completed", "postponed", "cancelled"].map(value => <option key={value}>{value}</option>)}
    </select>
    <div className="grid-cards">{list.map(match => <MatchCard key={match.id} match={match} state={state} actions={<>
      <button className="btn" onClick={() => setEditing(match)}>Manage</button>
      {match.status !== "completed" && <><button className="btn" onClick={() => void status(match, "in_progress")}>Start</button><button className="btn" onClick={() => void status(match, "postponed")}>Postpone</button></>}
    </>} />)}</div>
    {editing && <MatchEditor match={state.matches.find(match => match.id === editing.id)!} onClose={() => setEditing(null)} />}
  </>;
}
