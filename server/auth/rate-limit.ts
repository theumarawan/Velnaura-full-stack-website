import { createHash } from "node:crypto";
import { AuthProblem } from "./errors";

/** Fixed-window, process-local limiter. Replace with atomic Redis counters before scaling. */
export class MemoryRateLimiter {
  private entries = new Map<string, { count: number; expires: number }>();
  constructor(private now: () => number = Date.now, private maxEntries = 10000) {}
  consume(key: string, limit: number, windowMs: number) {
    const now = this.now();
    const previous = this.entries.get(key);
    if (previous && previous.expires > now) {
      if (previous.count >= limit) throw new AuthProblem("RATE_LIMITED", "Too many attempts. Please try again later.", 429, Math.ceil((previous.expires - now) / 1000));
      previous.count++;
      return;
    }
    if (this.entries.size >= this.maxEntries) {
      for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key);
      if (this.entries.size >= this.maxEntries) throw new AuthProblem("RATE_LIMITED", "Too many attempts. Please try again later.", 429, 60);
    }
    this.entries.set(key, { count: 1, expires: now + windowMs });
  }
}
export function privateKey(value: string) { return createHash("sha256").update(value).digest("hex"); }
