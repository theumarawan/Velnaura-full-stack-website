import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { safeCallbackPath } from "@/lib/auth/validation";
export const metadata = { title: "Sign in · Velnaura", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <AuthShell title="A familiar kind of care." intro="Welcome back. Your little corner of Velnaura is waiting.">
    <AuthForm mode="login" callbackUrl={safeCallbackPath(query.callbackUrl)} initialError={query.error ? "We couldn't sign you in. Please try again below." : ""} />
  </AuthShell>;
}
