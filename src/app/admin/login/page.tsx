import { LoginForm } from "@/components/admin/LoginForm";

export default function AdminLoginPage() {
  return <main className="container page" style={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center" }}><LoginForm /></main>;
}
