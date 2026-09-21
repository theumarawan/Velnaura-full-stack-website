import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata = { title: "Reset your password · Velnaura", robots: { index: false, follow: false } };
export default function ForgotPage() {
  return <AuthShell title="A fresh start." intro="It happens. Enter your email and we’ll help you find your way back."><AuthForm mode="forgot" /></AuthShell>;
}
