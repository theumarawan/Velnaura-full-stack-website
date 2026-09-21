import { compare, hash } from "bcryptjs";
import { scrypt, timingSafeEqual } from "node:crypto";

// Cost 12 = 4096 bcrypt work iterations; a practical interactive-login baseline.
// Benchmark on production hardware and tune upward while retaining acceptable latency.
export const BCRYPT_COST = 12;
export const hashPassword = (password: string) => hash(password, BCRYPT_COST);
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | undefined) {
  // Unknown identities still perform bcrypt work, keeping failure behavior similar.
  if (!stored) {
    dummyHash ??= hashPassword("Not-A-Real-Account-Password!92");
    await compare(password.slice(0, 72), await dummyHash);
    return false;
  }
  if (/^\$2[aby]\$/.test(stored)) {
    if (new TextEncoder().encode(password).length > 72) return false;
    return compare(password, stored);
  }
  // Preserve real Phase 1 seed accounts; upgrade their exact legacy format after login.
  const legacy = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  if (!legacy) return false;
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, legacy[1], 64, { N: 16384, r: 8, p: 1 }, (error, result) => error ? reject(error) : resolve(result));
  });
  return timingSafeEqual(key, Buffer.from(legacy[2], "hex"));
}
