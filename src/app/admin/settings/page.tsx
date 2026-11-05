"use client";
import { useRef, useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { downloadTournament, parseTournamentJson, readLegacyTournament } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import type { TournamentState } from "@/types/tournament";

export default function Settings() {
  const { state, mutate } = useTournament();
  const [name, setName] = useState(state.meta.name);
  const [description, setDescription] = useState(state.meta.description);
  const [startDate, setStartDate] = useState(state.meta.startDate ?? "");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<TournamentState | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const inspectFile = async (selected: File) => {
    try { setPreview(parseTournamentJson(await selected.text())); setMessage(""); }
    catch (cause) { setPreview(null); setMessage(cause instanceof Error ? cause.message : "Invalid snapshot. Database data was not changed."); }
  };
  const inspectLegacy = () => {
    try {
      const legacy = readLegacyTournament();
      if (!legacy) setMessage("No legacy localStorage tournament was found in this browser.");
      else { setPreview(legacy); setMessage(""); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Legacy data is invalid."); }
  };
  const importPreview = async () => {
    if (!preview || !confirm("Import this validated snapshot into Supabase? Existing database state will be backed up in the audit event and replaced atomically.")) return;
    try { await mutate({ action: "importSnapshot", payload: { snapshot: preview } }); setPreview(null); setMessage("Migration completed successfully."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Migration failed. Existing database data was preserved."); }
  };
  return <>
    <PageHeader eyebrow="Tournament configuration" title="Settings & migration" description="Manage shared tournament metadata and safely migrate a validated legacy browser snapshot." />
    <div className="panel" style={{ padding: 18 }}>
      <label>Name<input className="input" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Description<textarea className="input" rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Start date<input type="date" className="input" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={async () => {
        try { await mutate({ action: "settings", payload: { name, description, startDate: startDate || null, status: startDate ? "active" : "upcoming" } }); setMessage("Settings saved."); }
        catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save settings."); }
      }}>Save settings</button>
    </div>
    <div className="panel" style={{ padding: 18, marginTop: 18 }}>
      <h3>Backup and legacy migration</h3>
      <p className="muted">Export the authoritative Supabase state before importing any previous browser data.</p>
      <div className="toolbar">
        <button className="btn" onClick={() => downloadTournament(state)}>Export database backup</button>
        <button className="btn" onClick={inspectLegacy}>Inspect legacy localStorage</button>
        <button className="btn" onClick={() => file.current?.click()}>Inspect JSON backup</button>
        <input hidden ref={file} type="file" accept="application/json" onChange={event => event.target.files?.[0] && void inspectFile(event.target.files[0])} />
      </div>
      {preview && <div style={{ borderTop: "1px solid #27272a", paddingTop: 14 }}>
        <b>Validated import preview</b>
        <p className="muted">{preview.meta.name} · {preview.players.length} players · {preview.matches.length} matches · {preview.matches.filter(match => match.status === "completed").length} completed</p>
        <button className="btn primary" onClick={() => void importPreview()}>Confirm atomic import</button>{" "}
        <button className="btn" onClick={() => setPreview(null)}>Cancel</button>
      </div>}
      {message && <p>{message}</p>}
    </div>
  </>;
}
