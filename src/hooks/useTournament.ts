"use client";
import { useContext } from "react";import { TournamentContext } from "@/context/TournamentProvider";
export function useTournament(){const value=useContext(TournamentContext);if(!value)throw new Error("useTournament must be used inside TournamentProvider");return value}

