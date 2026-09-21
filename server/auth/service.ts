import type { PrismaClient } from "../../generated/prisma/client";
import type { EmailTransport } from "../../lib/email";
import { loginSchema, profileSchema, resetPasswordSchema, resetRequestSchema, signupSchema } from "../../lib/auth/validation";
import { AuthProblem } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { MemoryRateLimiter, privateKey } from "./rate-limit";
import { invalidReset, issueResetToken, tokenHash, verifyResetToken } from "./reset-token";

export const RESET_SENT_MESSAGE = "If an eligible account uses that email, a reset link is on its way. Check your inbox.";
export const identitySelect = { id: true, email: true, name: true, image: true, role: true, sessionVersion: true } as const;
const WINDOW = 15 * 60 * 1000;

export function createAuthService(db: PrismaClient, options: {
  secret: string; appUrl: string; mail: EmailTransport; limiter?: MemoryRateLimiter; now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const limiter = options.limiter ?? new MemoryRateLimiter(() => now().getTime());
  function throttle(action: string, client: string, email?: string) {
    limiter.consume(`${action}:client:${privateKey(client)}`, client === "shared" ? 100 : 20, WINDOW);
    if (email) limiter.consume(`${action}:email:${privateKey(email)}`, action === "login" ? 5 : 3, WINDOW);
  }
  return {
    async signup(input: unknown, client = "shared") {
      throttle("signup", client);
      const data = signupSchema.parse(input);
      const passwordHash = await hashPassword(data.password);
      try {
        return await db.user.create({ data: { name: data.name, email: data.email, passwordHash }, select: identitySelect });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          throw new AuthProblem("EMAIL_IN_USE", "An account already uses this email. Sign in or reset your password.", 409);
        }
        throw error;
      }
    },
    async authenticate(input: unknown, client = "shared") {
      const parsed = loginSchema.safeParse(input);
      throttle("login", client, parsed.success ? parsed.data.email : undefined);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;
      const user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(password, user?.passwordHash);
      if (!user || !valid || user.disabledAt) return null;
      if (user.passwordHash.startsWith("scrypt$")) {
        // Conditional update prevents a concurrent reset from being overwritten by a legacy upgrade.
        if (new TextEncoder().encode(password).length > 72) return null;
        const result = await db.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion, disabledAt: null },
          data: { passwordHash: await hashPassword(password) } });
        if (result.count !== 1) return null;
      }
      const current = await db.user.findUnique({ where: { id: user.id }, select: { ...identitySelect, disabledAt: true } });
      if (!current || current.disabledAt || current.sessionVersion !== user.sessionVersion) return null;
      const { disabledAt: _disabledAt, ...identity } = current;
      void _disabledAt;
      return identity;
    },
    async requestReset(input: unknown, client = "shared") {
      const { email } = resetRequestSchema.parse(input);
      throttle("forgot", client, email);
      // Check before account lookup so delivery outages don't disclose account existence.
      options.mail.assertAvailable();
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.disabledAt) return { message: RESET_SENT_MESSAGE };
      const grant = issueResetToken(user.id, options.secret, now());
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: grant.hash, expiresAt: grant.expiresAt } });
      });
      const url = new URL("/reset-password", options.appUrl);
      url.searchParams.set("token", grant.token);
      try {
        await options.mail.sendEmail({ to: email, subject: "A fresh start for your Velnaura account",
          text: `Reset your password using this link within 30 minutes:\n${url}\n\nThis link works once. If you didn't request it, you can ignore this email.\nSerious Science, Delightful Delivery.`,
        });
      } catch {
        await db.passwordResetToken.deleteMany({ where: { tokenHash: grant.hash } });
        throw new AuthProblem("EMAIL_UNAVAILABLE", "Password reset is temporarily unavailable. Please try again later.", 503);
      }
      return { message: RESET_SENT_MESSAGE };
    },
    async resetPassword(input: unknown, client = "shared") {
      throttle("reset", client);
      const { token, password } = resetPasswordSchema.parse(input);
      const time = now();
      const { userId } = verifyResetToken(token, options.secret, time);
      const digest = tokenHash(token);
      const grant = await db.passwordResetToken.findUnique({ where: { tokenHash: digest } });
      if (!grant || grant.userId !== userId || grant.usedAt || grant.expiresAt <= time) throw invalidReset();
      const passwordHash = await hashPassword(password);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.disabledAt) throw invalidReset();
        // Evaluate expiry again after hashing/lock waits, not just when the request arrived.
        const consumedAt = now();
        verifyResetToken(token, options.secret, consumedAt);
        const consumed = await tx.passwordResetToken.updateMany({
          where: { tokenHash: digest, userId, usedAt: null, expiresAt: { gt: consumedAt } }, data: { usedAt: consumedAt },
        });
        if (consumed.count !== 1) throw invalidReset();
        await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: consumedAt, sessionVersion: { increment: 1 } } });
        await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: consumedAt } });
      });
      return { message: "Your password is updated. Sign in with your new password." };
    },
    async editProfile(userId: string, input: unknown) {
      if (input && typeof input === "object" && "email" in input) {
        throw new AuthProblem("EMAIL_CHANGE_DEFERRED", "Email changes require verification and are not available yet.", 422);
      }
      const data = profileSchema.parse(input);
      const result = await db.user.updateMany({ where: { id: userId, disabledAt: null }, data });
      if (result.count !== 1) throw new AuthProblem("UNAUTHENTICATED", "Please sign in again.", 401);
      return db.user.findUniqueOrThrow({ where: { id: userId }, select: identitySelect });
    },
  };
}
