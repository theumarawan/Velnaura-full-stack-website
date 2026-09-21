import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { testDatabase } from "./test-database";

// Real HTTP handlers, Auth.js CSRF/cookies/JWT callbacks and server-rendered account guard.
test("authentication HTTP flows", { timeout: 180000 }, async t => {
  const database = await testDatabase();
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: database.url, DIRECT_URL: database.url,
      APP_URL: origin, AUTH_URL: origin, AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_TRUST_PROXY_IP: "false", NEXT_TELEMETRY_DISABLED: "1" },
  });
  let logs = "";
  child.stdout.on("data", data => { logs += data.toString(); });
  child.stderr.on("data", data => { logs += data.toString(); });
  const cookies = new Map<string, string>();
  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${origin}${path}`, { ...options, redirect: "manual", signal: AbortSignal.timeout(60000),
      headers: { origin, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...options.headers },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]; const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  const postJson = (path: string, body: unknown, method = "POST") => request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  async function login(password: string) {
    const csrf = await (await request("/api/auth/csrf")).json();
    return request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ email: "http@velnaura.test", password, csrfToken: csrf.csrfToken, callbackUrl: `${origin}/account` }),
    });
  }
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (child.exitCode !== null) throw new Error(`Next exited early: ${logs}`);
      try { if ((await request("/api/health")).ok) { ready = true; break; } } catch { /* Retry until Next has bound its port. */ }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready, `Next did not start: ${logs}`);
    await t.test("account guard redirects unauthenticated visitors and auth forms render", async () => {
      const account = await request("/account");
      assert.equal(account.status, 307); assert.match(account.headers.get("location")!, /\/login/);
      for (const path of ["/", "/signup", "/login", "/forgot-password", "/reset-password"]) {
        const response = await request(path); assert.equal(response.status, 200, path);
        assert.match(await response.text(), /Velnaura|velnaura/);
      }
    });
    await t.test("signup API returns 201, duplicate 409, invalid input 400 and rejects cross-origin", async () => {
      const input = { name: "HTTP Tester", email: "http@velnaura.test", password: "MyRitual!2026" };
      const created = await postJson("/api/auth/signup", input); assert.equal(created.status, 201);
      assert.equal((await created.json()).user.email, input.email);
      assert.equal((await postJson("/api/auth/signup", input)).status, 409);
      assert.equal((await postJson("/api/auth/signup", { ...input, password: "weak" })).status, 400);
      const forged = await request("/api/auth/signup", { method: "POST", headers: { origin: "https://outside.example", "Content-Type": "application/json" }, body: JSON.stringify(input) });
      assert.equal(forged.status, 403);
    });
    await t.test("wrong password fails generically; successful Auth.js login issues a JWT session", async () => {
      const failed = await (await login("WrongPassword!2026")).json();
      assert.match(failed.url, /CredentialsSignin/);
      const loggedIn = await (await login("MyRitual!2026")).json();
      assert.equal(loggedIn.url, `${origin}/account`);
      const session = await (await request("/api/auth/session")).json();
      assert.equal(session.user.email, "http@velnaura.test"); assert.equal(session.user.role, "CUSTOMER"); assert.ok(session.user.id);
      assert.equal("passwordHash" in session.user, false);
      const account = await request("/account"); assert.equal(account.status, 200); assert.match(await account.text(), /HTTP Tester|Welcome, HTTP/);
    });
    await t.test("profile API persists name and rejects unverified email changes", async () => {
      assert.equal((await postJson("/api/account/profile", { name: "Updated Name" }, "PATCH")).status, 200);
      assert.equal((await postJson("/api/account/profile", { email: "unsafe@example.test" }, "PATCH")).status, 422);
      const session = await (await request("/api/auth/session")).json(); assert.equal(session.user.name, "Updated Name");
    });
    await t.test("JWT reads fresh roles and session version revokes old cookies", async () => {
      await database.db.user.update({ where: { email: "http@velnaura.test" }, data: { role: "MODERATOR" } });
      assert.equal((await (await request("/api/auth/session")).json()).user.role, "MODERATOR");
      await database.db.user.update({ where: { email: "http@velnaura.test" }, data: { sessionVersion: { increment: 1 } } });
      assert.equal(await (await request("/api/auth/session")).json(), null);
      assert.equal((await postJson("/api/account/profile", { name: "Denied" }, "PATCH")).status, 401);
      assert.equal((await request("/account")).status, 307);
    });
    await t.test("signout removes authenticated access", async () => {
      await login("MyRitual!2026");
      const csrf = await (await request("/api/auth/csrf")).json();
      await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: origin }),
      });
      assert.equal(await (await request("/api/auth/session")).json(), null);
    });
  } finally {
    // Next dev has a worker process on Windows. Kill only the process tree started by this test.
    if (process.platform === "win32" && child.pid && child.exitCode === null) {
      await new Promise<void>(resolve => { const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); killer.once("exit", () => resolve()); killer.once("error", () => { child.kill(); resolve(); }); });
    } else child.kill();
    await database.close();
  }
});
