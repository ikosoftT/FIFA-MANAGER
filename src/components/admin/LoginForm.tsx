"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/app/admin/actions";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <form className="panel" style={{ padding: 24, width: "min(440px, 100%)" }} onSubmit={event => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await signIn(data);
      if (result.error) setError(result.error);
      else {
        router.replace("/admin");
        router.refresh();
      }
    });
  }}>
    <div className="eyebrow">Authorized organizers only</div>
    <h1 style={{ fontSize: 34 }}>Admin login</h1>
    <p className="muted">Sign in with the administrator account created in Supabase Auth.</p>
    <label>Email<input className="input" name="email" type="email" autoComplete="email" required /></label>
    <label style={{ display: "block", marginTop: 12 }}>Password<input className="input" name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
    {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
    <button className="btn primary" style={{ width: "100%", marginTop: 18 }} disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
