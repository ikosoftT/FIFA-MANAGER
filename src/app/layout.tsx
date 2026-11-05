import type {Metadata} from "next";import "./globals.css";import {TournamentProvider} from "@/context/TournamentProvider";import {Navbar} from "@/components/Navbar";
export const metadata:Metadata={title:"1337 FIFA Tournament",description:"The official 1337 FIFA knockout tournament"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Navbar/><TournamentProvider>{children}</TournamentProvider></body></html>}
