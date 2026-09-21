import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata = { title: "Create an account · Velnaura", robots: { index: false, follow: false } };
export default function SignupPage() {
  return <AuthShell title="Make room for your ritual." intro="A thoughtful start to your skincare story. Create your own little corner of Velnaura."><AuthForm mode="signup" /></AuthShell>;
}
