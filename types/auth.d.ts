import type { DefaultSession } from "next-auth";
import type { Role } from "../generated/prisma/enums";

declare module "next-auth" {
  interface Session { user: { id: string; role: Role; email: string } & DefaultSession["user"] }
  interface User { role: Role; sessionVersion: number }
}
declare module "next-auth/jwt" {
  interface JWT { role: Role; sessionVersion: number }
}
