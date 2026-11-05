import type { Match, Player, SlotSource, TournamentState } from "@/types/tournament";
import publishedTournament from "./published-tournament.json";

export const INITIAL_PAIRS = [
  ["yikoubaz","Sbouaa"],["abrami","ael-biya"],["Ibouzekr","aouhbi"],["asadraou","Sajabran"],
  ["mrasmok","saoubell"],["Mkaoukin","moel-hai"],["achbihi","ael-hamr"],["akoudri","ihamani"],
  ["atatbat","sbaghdad"],["abenitto","mochenna"],["oait-all","Moel-ben"],["wiben-ai","Achancha"],
  ["Tbenzaid","ohissane"],["abouanan","Yadib"],["iyamani","aelbouz"],["anel-kam","idouiri"],
  ["Bael-bad","akmarjou"],["abouferr","arochd"],["ael-fagr","mouabous"],["ilel-hla","amjouari"],
  ["test","mraoduan"],["ynini","sech-cha"],["Abouhou","khoukouj"],["jel-yous","omaezzem"],
  ["Abourach","aamajjou"],["fbenalla","mel-badd"],["ilaakoub","oatiya"],["Ymouafak","rboukind"],
  ["mait-bah","ymajji"],
] as const;

const pid = (name: string) => `p-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const mid = (n: number) => `M${String(n).padStart(2, "0")}`;
const source = (n: number, kind: SlotSource["kind"] = "match"): SlotSource => ({ kind, matchId: mid(n) });
const empty = (number: number, round: number, roundMatch: number, a: SlotSource | null, b: SlotSource | null): Match => ({
  id: mid(number), number, round, roundMatch, player1Id: null, player2Id: null,
  player1Source: a, player2Source: b, winnerId: null, loserId: null,
  player1Score: null, player2Score: null, tiebreakWinnerId: null, tiebreakMethod: null,
  resultType: null, absentPlayerId: null, status: "pending", scheduledAt: null,
  completedAt: null, durationMinutes: 10, station: "", notes: "",
});

export function createInitialTournament(): TournamentState {
  const createdAt = "2026-11-05T00:00:00.000Z";
  const players: Player[] = INITIAL_PAIRS.flat().map(username => ({ id: pid(username), username, status: "active", createdAt }));
  const matches: Match[] = INITIAL_PAIRS.map((pair, i) => ({
    ...empty(i + 1, 1, i + 1, null, null), player1Id: pid(pair[0]), player2Id: pid(pair[1]),
  }));
  for (let i = 0; i < 13; i++) matches.push(empty(30 + i, 2, i + 1, source(i * 2 + 1), source(i * 2 + 2)));
  const round3Sources: SlotSource[] = Array.from({ length: 13 }, (_, i) => source(30 + i));
  round3Sources.push(source(27, "bye"), source(28, "bye"), source(29, "bye"));
  for (let i = 0; i < 8; i++) matches.push(empty(43 + i, 3, i + 1, round3Sources[i * 2], round3Sources[i * 2 + 1]));
  for (let i = 0; i < 4; i++) matches.push(empty(51 + i, 4, i + 1, source(43 + i * 2), source(44 + i * 2)));
  for (let i = 0; i < 2; i++) matches.push(empty(55 + i, 5, i + 1, source(51 + i * 2), source(52 + i * 2)));
  matches.push(empty(57, 6, 1, source(55), source(56)));
  return { schemaVersion: 1, meta: { id: "1337-fifa-2026", name: "1337 FIFA Tournament", description: "Five days. Fifty-eight contenders. One champion.", format: "Single Elimination", status: "upcoming", startDate: null, durationDays: 5, timezone: "Africa/Casablanca", snapshotVersion: "2026-11-05.1", updatedAt: createdAt }, players, matches, history: [], championId: null, localModified: false };
}

export const initialTournament = publishedTournament as TournamentState;

