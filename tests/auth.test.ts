import assert from "node:assert/strict";
import { test } from "node:test";
import { scrypt, randomBytes } from "node:crypto";
import { createAuthService, RESET_SENT_MESSAGE } from "../server/auth/service";
import { assertRole } from "../server/auth/roles";
import { AuthProblem } from "../server/auth/errors";
import { MemoryRateLimiter } from "../server/auth/rate-limit";
import { tokenHash, RESET_TTL_MS } from "../server/auth/reset-token";
import { signupSchema, safeCallbackPath } from "../lib/auth/validation";
import type { EmailMessage } from "../lib/email";
import { testDatabase } from "./test-database";

const password = "Mugtea!Ritual2026";
test("authentication data layer", { timeout: 120000 }, async t => {
  const database = await testDatabase();
  const { db } = database;
  let clock = new Date();
  const outbox: EmailMessage[] = [];
  const service = createAuthService(db, { secret: randomBytes(32).toString("hex"), appUrl: "http://localhost:3000", now: () => new Date(clock),
    mail: { assertAvailable() {}, async sendEmail(message) { outbox.push(message); } },
  });
  function resetToken() {
    const match = outbox.at(-1)?.text.match(/http:\/\/localhost:3000\/reset-password\?token=([^\s]+)/);
    assert.ok(match);
    return new URL(`http://localhost:3000/reset-password?token=${match[1]}`).searchParams.get("token")!;
  }
  try {
    const user = await service.signup({ email: "  Hello@Velnaura.test  ", name: "Ayesha", password });
    await t.test("successful signup stores normalized email, CUSTOMER role and bcrypt cost 12", async () => {
      assert.equal(user.email, "hello@velnaura.test"); assert.equal(user.role, "CUSTOMER");
      const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
      assert.notEqual(stored.passwordHash, password);
      assert.equal("passwordHash" in user, false);
    });
    await t.test("duplicate email is explicitly rejected", async () => {
      await assert.rejects(service.signup({ email: "HELLO@velnaura.test", name: "Other", password }), (error: unknown) => error instanceof AuthProblem && error.status === 409 && error.code === "EMAIL_IN_USE");
    });
    await t.test("shared validator rejects weak, over-byte-limit and injected-role inputs", () => {
      for (const weak of ["short", "alllowercase123!", "ALLUPPERCASE123!", "NoNumbersHere!", "NoSymbolsHere123", `Aa1!${"é".repeat(35)}`]) {
        assert.equal(signupSchema.safeParse({ email: "a@b.test", name: "A", password: weak }).success, false);
      }
      assert.equal(signupSchema.safeParse({ email: "a@b.test", name: "A", password, role: "ADMIN" }).success, false);
      assert.equal(safeCallbackPath("//evil.test"), "/account");
      assert.equal(safeCallbackPath("/account/orders"), "/account/orders");
    });
    await t.test("wrong passwords and unknown identities both return null; correct login succeeds", async () => {
      assert.equal(await service.authenticate({ email: user.email, password: "WrongPassword!9" }), null);
      assert.equal(await service.authenticate({ email: "unknown@velnaura.test", password }), null);
      const identity = await service.authenticate({ email: user.email, password });
      assert.equal(identity?.id, user.id); assert.equal(identity?.role, "CUSTOMER");
      assert.equal("passwordHash" in identity!, false);
    });
    await t.test("CUSTOMER cannot access a MODERATOR-only guard", () => {
      assert.throws(() => assertRole(user, ["MODERATOR"]), (error: unknown) => error instanceof AuthProblem && error.status === 403);
      assert.throws(() => assertRole(null, ["MODERATOR"]), (error: unknown) => error instanceof AuthProblem && error.status === 401);
      assert.equal(assertRole({ id: "moderator", role: "MODERATOR" }, ["MODERATOR"]).id, "moderator");
    });
    await t.test("login rate limit blocks after five attempts and expires after fifteen minutes", async () => {
      for (let i = 0; i < 5; i++) await service.authenticate({ email: "limited@velnaura.test", password }, "test-client");
      await assert.rejects(service.authenticate({ email: "limited@velnaura.test", password }, "test-client"), (error: unknown) => error instanceof AuthProblem && error.status === 429);
      clock = new Date(clock.getTime() + 15 * 60 * 1000 + 1);
      assert.equal(await service.authenticate({ email: "limited@velnaura.test", password }, "test-client"), null);
    });
    await t.test("reset requests are non-enumerating and persist only the hash", async () => {
      assert.deepEqual(await service.requestReset({ email: user.email }), { message: RESET_SENT_MESSAGE });
      const token = resetToken();
      const grant = await db.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: tokenHash(token) } });
      assert.equal(grant.tokenHash.includes(token), false);
      assert.equal(grant.expiresAt.getTime(), clock.getTime() + RESET_TTL_MS);
      assert.deepEqual(await service.requestReset({ email: "absent@velnaura.test" }), { message: RESET_SENT_MESSAGE });
      assert.equal(outbox.length, 1);
    });
    await t.test("expired reset token is rejected without changing the password", async () => {
      const token = resetToken();
      clock = new Date(clock.getTime() + RESET_TTL_MS + 1);
      await assert.rejects(service.resetPassword({ token, password: "NewRitual!2026" }), /invalid or has expired/);
      assert.ok(await service.authenticate({ email: user.email, password }));
    });
    await t.test("tampering is rejected; reset changes password, increments session version and cannot be replayed", async () => {
      await service.requestReset({ email: user.email });
      const token = resetToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      const tampered = `${Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 999999 })).toString("base64url")}.${parts[1]}`;
      await assert.rejects(service.resetPassword({ token: tampered, password: "NewRitual!2026" }), /invalid or has expired/);
      await service.resetPassword({ token, password: "NewRitual!2026" });
      assert.equal(await service.authenticate({ email: user.email, password }), null);
      assert.ok(await service.authenticate({ email: user.email, password: "NewRitual!2026" }));
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
      await assert.rejects(service.resetPassword({ token, password }), /invalid or has expired/);
    });
    await t.test("database expiry independently invalidates a signed token", async () => {
      await service.requestReset({ email: user.email });
      const token = resetToken();
      await db.passwordResetToken.update({ where: { tokenHash: tokenHash(token) }, data: { expiresAt: new Date(clock.getTime() - 1) } });
      await assert.rejects(service.resetPassword({ token, password }), /invalid or has expired/);
    });
    await t.test("profile name edits persist and email changes are rejected", async () => {
      assert.equal((await service.editProfile(user.id, { name: "Ayesha Khan" })).name, "Ayesha Khan");
      await assert.rejects(service.editProfile(user.id, { name: "Ayesha", email: "changed@example.test" }), (error: unknown) => error instanceof AuthProblem && error.code === "EMAIL_CHANGE_DEFERRED");
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email, user.email);
    });
    await t.test("legacy Phase 1 scrypt accounts upgrade on successful login", async () => {
      const salt = randomBytes(16).toString("hex");
      const key = await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
      const legacy = await db.user.create({ data: { email: "legacy@velnaura.test", passwordHash: `scrypt$16384$8$1$${salt}$${key.toString("hex")}` } });
      assert.equal((await service.authenticate({ email: legacy.email, password }))?.id, legacy.id);
      assert.match((await db.user.findUniqueOrThrow({ where: { id: legacy.id } })).passwordHash, /^\$2[aby]\$12\$/);
    });
    await t.test("disabled accounts cannot authenticate", async () => {
      await db.user.update({ where: { id: user.id }, data: { disabledAt: clock } });
      assert.equal(await service.authenticate({ email: user.email, password: "NewRitual!2026" }), null);
    });
    await t.test("unavailable email configuration fails equally for known and unknown accounts", async () => {
      const unavailable = createAuthService(db, { secret: "x".repeat(32), appUrl: "http://localhost:3000", mail: {
        assertAvailable() { throw new AuthProblem("EMAIL_UNAVAILABLE", "Unavailable", 503); }, async sendEmail() { throw new Error("Must not send"); },
      } });
      for (const email of [user.email, "nobody@example.test"]) await assert.rejects(unavailable.requestReset({ email }), (error: unknown) => error instanceof AuthProblem && error.status === 503);
    });
    await t.test("rate limiter stays bounded when full", () => {
      const limiter = new MemoryRateLimiter(() => 0, 1);
      limiter.consume("one", 1, 1000);
      assert.throws(() => limiter.consume("two", 1, 1000), /Too many/);
    });
  } finally { await database.close(); }
});
