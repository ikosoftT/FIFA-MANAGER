import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentState } from "@/lib/tournament/repository";

export async function GET() {
  try {
    const state = await getTournamentState(await createClient());
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load tournament.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
