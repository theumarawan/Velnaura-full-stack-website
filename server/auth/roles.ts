import type { Role } from "../../generated/prisma/enums";
import { AuthProblem } from "./errors";

export type RoleIdentity = { id: string; role: Role };
/** Explicit allow-list: ADMIN is not implicitly granted MODERATOR-only access. */
export function assertRole<T extends RoleIdentity>(user: T | null | undefined, allowed: readonly Role[]): T {
  if (!user) throw new AuthProblem("UNAUTHENTICATED", "Please sign in to continue.", 401);
  if (!allowed.includes(user.role)) throw new AuthProblem("FORBIDDEN", "You do not have access to this area.", 403);
  return user;
}
