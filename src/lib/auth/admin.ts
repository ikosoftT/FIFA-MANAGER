import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login");
  const { data: allowed, error: roleError } = await supabase.rpc("is_tournament_admin");
  if (roleError || !allowed) throw new Error("This account is not authorized to administer the tournament.");
  return { supabase, user };
}
