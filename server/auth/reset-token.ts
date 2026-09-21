import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthProblem } from "./errors";

export const RESET_TTL_MS = 30 * 60 * 1000;
export const invalidReset = () => new AuthProblem("INVALID_RESET", "This reset link is invalid or has expired. Request a new one.");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function signature(payload: string, secret: string) {
  // Purpose prefix prevents cross-protocol reuse of the Auth.js secret.
  return createHmac("sha256", secret).update(`velnaura:password-reset:v1:${payload}`).digest();
}
export function issueResetToken(userId: string, secret: string, now: Date) {
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt.getTime(), nonce: randomBytes(32).toString("base64url") })).toString("base64url");
  const token = `${payload}.${signature(payload, secret).toString("base64url")}`;
  return { token, hash: tokenHash(token), expiresAt };
}
export function verifyResetToken(token: string, secret: string, now: Date): { userId: string } {
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 2048 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw invalidReset();
  const actual = Buffer.from(parts[1], "base64url");
  const expected = signature(parts[0], secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidReset();
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp <= now.getTime() || typeof payload.nonce !== "string") throw invalidReset();
    return { userId: payload.sub };
  } catch { throw invalidReset(); }
}
