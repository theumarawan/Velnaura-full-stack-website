import type { ReactNode } from "react";
import { requireUser } from "@/server/auth/guards";
export const metadata = { title: "Your account · Velnaura", robots: { index: false, follow: false } };
export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
