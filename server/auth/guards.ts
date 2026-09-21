import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDatabase } from "../db";
import type { Role } from "../../generated/prisma/enums";
import { assertRole } from "./roles";
import { identitySelect } from "./service";
import { AuthProblem } from "./errors";

export async function authenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getDatabase().user.findFirst({ where: { id: session.user.id, disabledAt: null }, select: { ...identitySelect, phone: true, emailVerified: true, createdAt: true } });
}
export async function requireUser() {
  const user = await authenticatedUser();
  if (!user) redirect("/login?callbackUrl=%2Faccount");
  return user;
}
/** API guard returns a typed 401/403 problem; caller serializes with errorResponse. */
export async function requireRole(allowed: readonly Role[]) {
  return assertRole(await authenticatedUser(), allowed);
}
export async function requireApiUser() {
  const user = await authenticatedUser();
  if (!user) throw new AuthProblem("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return user;
}
