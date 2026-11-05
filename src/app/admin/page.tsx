"use client";
import Link from "next/link";
import { useTournament } from "@/hooks/useTournament";
import { stats, ROUND_NAMES } from "@/lib/tournament-engine";
import { PageHeader } from "@/components/PageHeader";
import { downloadTournament } from "@/lib/storage";

export default function Admin() {
  const { state } = useTournament();
  const summary = stats(state);
  const current = state.matches.find(match => match.status !== "completed" && match.player1Id && match.player2Id)?.round ?? 6;
  const cards = [
    ["Completed", summary.completed], ["Remaining", summary.remaining],
    ["Unscheduled", state.matches.filter(match => !match.scheduledAt && match.status !== "completed").length],
    ["Walkovers", summary.walkovers], ["Progress", summary.progress + "%"], ["Current round", ROUND_NAMES[current]],
  ];
  return <>
    <PageHeader eyebrow="Secure control room" title="Tournament admin" description="Manage the shared tournament state stored in Supabase." />
    <div className="grid-cards">{cards.map(([label, value]) => <div className="panel" style={{ padding: 18 }} key={label}><div className="muted">{label}</div><strong style={{ fontSize: 26 }}>{value}</strong></div>)}</div>
    <div className="toolbar"><Link className="btn primary" href="/admin/matches">Manage matches</Link><Link className="btn" href="/admin/players">Manage players</Link><button className="btn" onClick={() => downloadTournament(state)}>Export backup</button></div>
    <div className="panel" style={{ padding: 18 }}><b>Recent database activity</b>
      {state.history.slice(0, 8).map(event => <div key={event.id} style={{ borderTop: "1px solid #27272a", padding: "10px 0", marginTop: 10 }}>{event.description}<div className="muted" style={{ fontSize: 12 }}>{new Date(event.at).toLocaleString()}</div></div>)}
      {!state.history.length && <p className="muted">No administrative changes yet.</p>}
    </div>
  </>;
}
