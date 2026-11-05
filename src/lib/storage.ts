import { validateTournament } from "@/lib/tournament-validation";
import type { TournamentState } from "@/types/tournament";

export const LEGACY_STORAGE_KEY = "1337-fifa-tournament-v1";

export function parseTournamentJson(raw: string) {
  return validateTournament(JSON.parse(raw));
}

export function readLegacyTournament(): TournamentState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  return raw ? parseTournamentJson(raw) : null;
}

export function downloadTournament(state: TournamentState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "1337-fifa-tournament-" + new Date().toISOString().slice(0, 10) + ".json";
  anchor.click();
  URL.revokeObjectURL(url);
}
