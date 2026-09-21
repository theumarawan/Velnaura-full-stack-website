import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata = { title: "Choose a new password · Velnaura", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <AuthShell title="Your next fresh start." intro="Choose a new password. A little care goes a long way."><AuthForm mode="reset" token={typeof token === "string" ? token : ""} initialError={typeof token === "string" && token ? "" : "This reset link is missing its token. Request a new one below."} /></AuthShell>;
}

