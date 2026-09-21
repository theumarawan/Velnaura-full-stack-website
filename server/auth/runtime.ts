import "server-only";
import { getDatabase } from "../db";
import { emailTransport } from "../../lib/email";
import { createAuthService } from "./service";
import { MemoryRateLimiter } from "./rate-limit";

const globalAuth = globalThis as unknown as { velnauraAuthLimiter?: MemoryRateLimiter };
export function getAuthService() {
  globalAuth.velnauraAuthLimiter ??= new MemoryRateLimiter();
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set AUTH_SECRET to a random secret of at least 32 characters.");
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required.");
  return createAuthService(getDatabase(), { secret, appUrl, mail: emailTransport, limiter: globalAuth.velnauraAuthLimiter });
}
