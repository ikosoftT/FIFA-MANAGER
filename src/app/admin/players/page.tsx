"use client";
import { useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { PageHeader } from "@/components/PageHeader";

export default function AdminPlayers() {
  const { state, mutate } = useTournament();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const run = async (operation: () => Promise<void>) => {
    setMessage("");
    try { await operation(); setMessage("Saved."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Failed."); }
  };
  return <>
    <PageHeader eyebrow="Roster" title="Manage players" description="Add eligible substitutes or correct display names. Username uniqueness is enforced by PostgreSQL." />
    <div className="panel" style={{ padding: 18 }}>
      <b>Add substitute</b>
      <div className="toolbar"><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="New username" /><button className="btn primary" onClick={() => void run(async () => { await mutate({ action: "addPlayer", payload: { username: name } }); setName(""); })}>Add player</button></div>
      {message && <p className="muted">{message}</p>}
    </div>
    <input className="input" style={{ maxWidth: 350, margin: "18px 0" }} placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="panel table-wrap"><table className="table"><thead><tr><th>Username</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {state.players.filter(player => player.username.toLowerCase().includes(query.toLowerCase())).map(player => <tr key={player.id}><td>{player.username}</td><td><span className="badge">{player.status}</span></td><td><button className="btn" onClick={() => { const username = prompt("New username", player.username); if (username) void run(() => mutate({ action: "renamePlayer", payload: { playerId: player.id, username } })); }}>Rename</button></td></tr>)}
    </tbody></table></div>
  </>;
}
