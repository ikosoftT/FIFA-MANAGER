"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { getTournamentState } from "@/lib/tournament/repository";
import { tournamentSchema } from "@/lib/tournament-validation";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), payload: z.object({ matchId: z.string().uuid(), scheduledAt: z.string().datetime().nullable(), station: z.string().max(100), override: z.boolean().default(false) }) }),
  z.object({ action: z.literal("recordResult"), payload: z.object({ matchId: z.string().uuid(), player1Score: z.number().int().nonnegative(), player2Score: z.number().int().nonnegative(), tiebreakWinnerId: z.string().uuid().optional(), tiebreakMethod: z.string().max(100).optional() }) }),
  z.object({ action: z.literal("walkover"), payload: z.object({ matchId: z.string().uuid(), winnerId: z.string().uuid() }) }),
  z.object({ action: z.literal("revertResult"), payload: z.object({ matchId: z.string().uuid() }) }),
  z.object({ action: z.literal("replacePlayer"), payload: z.object({ matchId: z.string().uuid(), oldPlayerId: z.string().uuid(), newPlayerId: z.string().uuid() }) }),
  z.object({ action: z.literal("status"), payload: z.object({ matchId: z.string().uuid(), status: z.enum(["in_progress", "postponed", "cancelled"]) }) }),
  z.object({ action: z.literal("addPlayer"), payload: z.object({ username: z.string().trim().min(1).max(80) }) }),
  z.object({ action: z.literal("renamePlayer"), payload: z.object({ playerId: z.string().uuid(), username: z.string().trim().min(1).max(80) }) }),
  z.object({ action: z.literal("settings"), payload: z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000), startDate: z.string().date().nullable(), status: z.enum(["upcoming", "active", "completed"]) }) }),
  z.object({ action: z.literal("importSnapshot"), payload: z.object({ snapshot: z.unknown() }) }),
]);

export type AdminMutation = z.input<typeof mutationSchema>;
export type ActionResult = { ok: true; state: Awaited<ReturnType<typeof getTournamentState>> } | { ok: false; error: string };

export async function runAdminMutation(input: AdminMutation): Promise<ActionResult> {
  try {
    const command = mutationSchema.parse(input);
    const { supabase } = await requireAdmin();
    let response: { error: { message: string } | null };
    switch (command.action) {
      case "schedule":
        response = await supabase.rpc("admin_schedule_match", {
          p_match_id: command.payload.matchId, p_scheduled_at: command.payload.scheduledAt,
          p_station: command.payload.station, p_override_window: command.payload.override,
        }); break;
      case "recordResult":
        response = await supabase.rpc("admin_record_result", {
          p_match_id: command.payload.matchId, p_player1_score: command.payload.player1Score,
          p_player2_score: command.payload.player2Score,
          p_tiebreak_winner_id: command.payload.tiebreakWinnerId ?? null,
          p_tiebreak_method: command.payload.tiebreakMethod ?? null,
        }); break;
      case "walkover":
        response = await supabase.rpc("admin_award_walkover", { p_match_id: command.payload.matchId, p_winner_id: command.payload.winnerId }); break;
      case "revertResult":
        response = await supabase.rpc("admin_revert_result", { p_match_id: command.payload.matchId }); break;
      case "replacePlayer":
        response = await supabase.rpc("admin_replace_player", {
          p_match_id: command.payload.matchId, p_old_player_id: command.payload.oldPlayerId, p_new_player_id: command.payload.newPlayerId,
        }); break;
      case "status":
        response = await supabase.rpc("admin_set_match_status", { p_match_id: command.payload.matchId, p_status: command.payload.status }); break;
      case "addPlayer":
        response = await supabase.rpc("admin_add_player", { p_username: command.payload.username }); break;
      case "renamePlayer":
        response = await supabase.rpc("admin_rename_player", { p_player_id: command.payload.playerId, p_username: command.payload.username }); break;
      case "settings":
        response = await supabase.rpc("admin_update_tournament", {
          p_name: command.payload.name, p_description: command.payload.description,
          p_start_date: command.payload.startDate, p_status: command.payload.status,
        }); break;
      case "importSnapshot": {
        const snapshot = tournamentSchema.parse(command.payload.snapshot);
        response = await supabase.rpc("admin_import_tournament_snapshot", { p_snapshot: snapshot });
        break;
      }
    }
    if (response.error) throw new Error(response.error.message);
    ["/", "/matches", "/bracket", "/players", "/results", "/admin"].forEach(path => revalidatePath(path));
    return { ok: true, state: await getTournamentState(supabase) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The database operation failed." };
  }
}

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = z.string().email().safeParse(formData.get("email"));
  const password = z.string().min(8).safeParse(formData.get("password"));
  if (!email.success || !password.success) return { error: "Enter a valid email and password." };
  const { supabase } = await requireLoginClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) return { error: "Invalid email or password." };
  const { data: allowed } = await supabase.rpc("is_tournament_admin");
  if (!allowed) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized as an administrator." };
  }
  return {};
}

async function requireLoginClient() {
  const { createClient } = await import("@/lib/supabase/server");
  return { supabase: await createClient() };
}

export async function signOut() {
  const { supabase } = await requireLoginClient();
  await supabase.auth.signOut();
}
