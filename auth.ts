import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getAuthService } from "@/server/auth/runtime";
import { getDatabase } from "@/server/db";
import { clientKey } from "@/server/auth/http";
import { AuthProblem } from "@/server/auth/errors";

class LoginLimited extends CredentialsSignin { code = "rate_limited"; }
class LoginUnavailable extends CredentialsSignin { code = "service_unavailable"; }

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [Credentials({
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials, request) {
      try { return await getAuthService().authenticate(credentials, clientKey(request)); }
      catch (error) {
        if (error instanceof AuthProblem && error.status === 429) throw new LoginLimited();
        throw new LoginUnavailable();
      }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.sub = user.id; token.sessionVersion = user.sessionVersion; }
      if (!token.sub || typeof token.sessionVersion !== "number") return null;
      // Read current identity on every use: deleted/disabled users, reset passwords and role changes take effect immediately.
      const current = await getDatabase().user.findUnique({ where: { id: token.sub }, select: {
        id: true, role: true, email: true, name: true, image: true, disabledAt: true, sessionVersion: true,
      } });
      if (!current || current.disabledAt || current.sessionVersion !== token.sessionVersion) return null;
      token.role = current.role; token.email = current.email; token.name = current.name; token.picture = current.image;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      const role = token.role;
      if (role !== "CUSTOMER" && role !== "MODERATOR" && role !== "ADMIN") throw new Error("Invalid session role.");
      session.user.role = role;
      session.user.email = token.email!;
      return session;
    },
    redirect({ url, baseUrl }) {
      const origin = new URL(process.env.APP_URL ?? baseUrl).origin;
      const target = new URL(url, origin);
      return target.origin === origin ? target.href : `${origin}/account`;
    },
  },
});


