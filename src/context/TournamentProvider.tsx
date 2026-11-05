"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { runAdminMutation, type AdminMutation } from "@/app/admin/actions";
import type { TournamentState } from "@/types/tournament";

type Context = {
  state: TournamentState;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (command: AdminMutation) => Promise<void>;
};

export const TournamentContext = createContext<Context | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<TournamentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/tournament", { cache: "no-store" });
      const body = await response.json() as TournamentState | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Could not load tournament.");
      setState(body);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load tournament.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const mutate = useCallback(async (command: AdminMutation) => {
    const result = await runAdminMutation(command);
    if (!result.ok) throw new Error(result.error);
    setState(result.state);
    setError(null);
  }, []);

  const value = useMemo<Context | null>(
    () => state ? { state, ready: true, error, refresh, mutate } : null,
    [state, error, refresh, mutate],
  );

  if (pathname === "/admin/login") return children;
  if (!value) {
    return <div className="container page"><div className="panel" style={{ padding: 24 }}>
      {error ? <><h2>Tournament unavailable</h2><p className="muted">{error}</p><button className="btn" onClick={() => void refresh()}>Try again</button></> : <p className="muted">Loading tournament…</p>}
    </div></div>;
  }
  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}
