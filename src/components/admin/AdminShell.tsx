"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Database, LogOut } from "lucide-react";
import { signOut } from "@/app/admin/actions";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/admin/login") return children;
  return <main className="container page">
    <div className="panel" style={{ padding: 12, marginBottom: 18, color: "#a3e635", display: "flex", gap: 8, fontSize: 13 }}>
      <Database size={17} />Connected to the shared Supabase tournament database.
    </div>
    <div className="admin-shell">
      <aside className="panel admin-nav" style={{ padding: 10, height: "fit-content" }}>
        {[["/admin", "Overview"], ["/admin/matches", "Matches"], ["/admin/players", "Players"], ["/admin/settings", "Settings"]].map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
        <button className="btn" onClick={async () => { await signOut(); router.replace("/admin/login"); router.refresh(); }}><LogOut size={16} />Logout</button>
      </aside>
      <section>{children}</section>
    </div>
  </main>;
}
