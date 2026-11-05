import { z } from "zod";
import type { TournamentState } from "@/types/tournament";

const playerSchema=z.object({id:z.string().min(1),username:z.string().min(1),status:z.enum(["active","eliminated","withdrawn","champion","substitute"]),createdAt:z.string()});
const sourceSchema=z.object({kind:z.enum(["match","bye"]),matchId:z.string()}).nullable();
const matchSchema=z.object({id:z.string(),number:z.number().int().positive(),round:z.number().int().min(1).max(6),roundMatch:z.number().int().positive(),player1Id:z.string().nullable(),player2Id:z.string().nullable(),player1Source:sourceSchema,player2Source:sourceSchema,winnerId:z.string().nullable(),loserId:z.string().nullable(),player1Score:z.number().int().nonnegative().nullable(),player2Score:z.number().int().nonnegative().nullable(),tiebreakWinnerId:z.string().nullable(),tiebreakMethod:z.string().nullable(),resultType:z.enum(["normal","walkover"]).nullable(),absentPlayerId:z.string().nullable(),status:z.enum(["pending","scheduled","in_progress","completed","postponed","cancelled"]),scheduledAt:z.string().nullable(),completedAt:z.string().nullable(),durationMinutes:z.literal(10),station:z.string(),notes:z.string()});
export const tournamentSchema=z.object({schemaVersion:z.literal(1),meta:z.object({id:z.string(),name:z.string().min(1),description:z.string(),format:z.literal("Single Elimination"),status:z.enum(["upcoming","active","completed"]),startDate:z.string().nullable(),durationDays:z.literal(5),timezone:z.literal("Africa/Casablanca"),snapshotVersion:z.string(),updatedAt:z.string()}),players:z.array(playerSchema).min(58),matches:z.array(matchSchema).length(57),history:z.array(z.object({id:z.string(),at:z.string(),type:z.string(),description:z.string(),matchId:z.string().optional()})),championId:z.string().nullable(),localModified:z.boolean()});

export function validateTournament(input:unknown):TournamentState {
  const state=tournamentSchema.parse(input);
  const pids=new Set(state.players.map(p=>p.id));
  const mids=new Set(state.matches.map(m=>m.id));
  const byNumber=new Map(state.matches.map(m=>[m.number,m]));
  if(pids.size!==state.players.length)throw new Error("Duplicate player IDs.");
  if(mids.size!==57||byNumber.size!==57)throw new Error("Duplicate match identifiers.");
  const expectedRound=(number:number)=>number<=29?1:number<=42?2:number<=50?3:number<=54?4:number<=56?5:6;
  const expectedSources=(number:number):number[]=>{
    if(number<=29)return[];
    if(number<=42){const offset=number-30;return[offset*2+1,offset*2+2]}
    if(number<=50){const slots=[...Array.from({length:13},(_,i)=>30+i),27,28,29];const offset=(number-43)*2;return[slots[offset],slots[offset+1]]}
    if(number<=54){const offset=number-51;return[43+offset*2,44+offset*2]}
    if(number<=56){const offset=number-55;return[51+offset*2,52+offset*2]}
    return[55,56];
  };
  for(let number=1;number<=57;number++){
    const match=byNumber.get(number);
    if(!match)throw new Error("Missing match number "+number+".");
    if(match.round!==expectedRound(number))throw new Error(match.id+" has an invalid round.");
    const sources=[match.player1Source,match.player2Source].filter(Boolean).map(source=>state.matches.find(item=>item.id===source!.matchId)?.number);
    const expected=expectedSources(number);
    if(sources.length!==expected.length||sources.some((source,index)=>source!==expected[index]))throw new Error(match.id+" has invalid advancement sources.");
  }
  for(const match of state.matches){
    for(const id of [match.player1Id,match.player2Id,match.winnerId,match.loserId,match.absentPlayerId].filter(Boolean) as string[])if(!pids.has(id))throw new Error(match.id+" references an unknown player.");
    for(const source of [match.player1Source,match.player2Source])if(source&&!mids.has(source.matchId))throw new Error(match.id+" references an unknown source match.");
    if(match.player1Id&&match.player1Id===match.player2Id)throw new Error(match.id+" contains a self-match.");
    if(match.winnerId&&![match.player1Id,match.player2Id].includes(match.winnerId))throw new Error(match.id+" winner is not a participant.");
    if(match.status==="completed"&&(!match.winnerId||!match.loserId))throw new Error(match.id+" is completed without a winner and loser.");
    if(match.resultType==="walkover"&&(match.player1Score!==null||match.player2Score!==null))throw new Error(match.id+" fabricates a walkover score.");
    [match.player1Source,match.player2Source].forEach((source,index)=>{
      if(!source)return;
      const sourceMatch=state.matches.find(item=>item.id===source.matchId)!;
      const participant=index===0?match.player1Id:match.player2Id;
      if(sourceMatch.winnerId!==participant)throw new Error(match.id+" advancement does not match "+sourceMatch.id+".");
    });
  }
  const active=state.matches.filter(match=>match.status!=="completed").flatMap(match=>[match.player1Id,match.player2Id]).filter(Boolean) as string[];
  if(new Set(active).size!==active.length)throw new Error("A player occupies multiple active bracket positions.");
  const final=byNumber.get(57)!;
  if(state.championId!==final.winnerId)throw new Error("Champion does not match the final winner.");
  return state;
}
