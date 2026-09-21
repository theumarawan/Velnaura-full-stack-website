# Phase 2: Authentication

## Running and trying the flows

After pulling these changes, run `pnpm install --frozen-lockfile`, `pnpm db:generate`, and `pnpm db:migrate` against PostgreSQL. Existing accounts are preserved. Run `pnpm db:seed` if you need development accounts. New seed hashes are bcrypt; pre-existing Phase 1 scrypt accounts are verified and upgraded to bcrypt on their next successful login. Seed reruns never reset passwords.

Set `AUTH_SECRET` to at least 32 random characters, `APP_URL` to the exact public origin (local default `http://localhost:3000`), and `AUTH_URL` to the same origin. `scripts/setup-env.ts` creates these settings for a new local installation but deliberately does not overwrite an existing `.env`.

Run `pnpm dev`. Visit `/signup`, `/login`, `/forgot-password`, `/reset-password?token=…` and `/account`. `/` is a public welcome page and the destination for “Continue as guest.” Shopping is still a later phase. A reset request in development prints the full email and link to the server terminal; use that link within 30 minutes. Never copy local reset logs into shared telemetry.

## Identity, passwords and sessions

- `auth.ts` configures Auth.js 5 credentials with JWT sessions lasting up to eight hours. There are no OAuth providers or adapter-managed database sessions. The pinned Auth.js release is `5.0.0-beta.32`; review its release status when upgrading dependencies.
- Session responses carry `user.id`, `user.email`, `user.role`, name and image. Password hashes and internal session versions are never exposed in the session response.
- Every JWT use re-reads the user. Deleted/disabled users and changed `sessionVersion` invalidate the JWT; changed roles and names appear on the next request. Password reset increments `sessionVersion` and revokes all prior sessions.
- One shared Zod validator in `lib/auth/validation.ts` is used by signup/reset forms and their backend services. Passwords require **at least 12 characters**, an ASCII uppercase letter, ASCII lowercase letter, digit and a non-whitespace symbol, and may contain **at most 72 UTF-8 bytes**. Passwords are never trimmed. The byte limit prevents bcrypt's silent truncation, including for multibyte characters.
- Bcrypt cost **12** performs 2^12 work iterations. It is an interactive-login baseline; benchmark on deployment hardware before tuning it. Hashing runs outside database transactions. Phase 1's narrowly matched scrypt hash format is supported only for migration on successful login.
- Login always reports a generic email/password error for a wrong password, nonexistent identity or disabled account. Unknown identities still perform a bcrypt comparison. Signup intentionally reports duplicate emails as HTTP 409, as requested.
- Signup accounts start as CUSTOMER and unverified. Client-supplied roles are rejected. An initial email-verification flow is not part of this phase; do not treat signup email as proof of ownership of past guest orders.

## Rate limits and request integrity

The process-local fixed-window limiter applies to login, signup, reset requests and reset submissions. All windows are 15 minutes. Login allows five attempts per normalized email, reset requests three per normalized email, and each action permits 20 requests per trusted client IP. Without a trusted client IP, the shared-client bucket permits 100 requests per action. Successes also count; restarting a worker resets the counters. Keys hash email/IP values; the map is bounded to 10,000 entries and rejects new buckets if full.

Set `AUTH_TRUST_PROXY_IP=true` only behind a proxy that **overwrites** `x-real-ip`; otherwise it defaults to a shared bucket and does not trust caller-supplied IP headers. `AUTH_TRUST_HOST` is a separate Auth.js setting for trusted host/proxy deployment. Multi-instance/serverless deployment requires shared atomic Redis counters before relying on these limits. Account-based throttling can temporarily inconvenience legitimate users during targeted abuse; production should add adaptive controls.

Auth.js owns CSRF protection for credential sign-in/sign-out. Custom JSON mutation endpoints require an Origin exactly matching `APP_URL`, accept only JSON, cap bodies at 8 KiB, and return structured errors without database internals. API responses are `no-store`. Redirect destinations are constrained to the configured app origin, and the login UI accepts only local `/account` paths. Reset pages use `Referrer-Policy: no-referrer`.

## Password reset and delivery boundary

A reset token consists of a signed JSON payload containing user ID, expiry and a cryptographically random 32-byte nonce. HMAC-SHA256 uses `AUTH_SECRET` with a password-reset-specific purpose prefix. Only SHA-256(token) is stored, together with its user, expiry and consumption timestamp. Rotating `AUTH_SECRET` also invalidates outstanding reset links.

Issuance replaces earlier grants for that user. Consumption validates the signature, signed expiry and stored expiry, locks the user, and atomically claims the unused grant, changes the password and increments session version in one transaction. Concurrent/replayed submissions cannot both succeed. Invalid, expired and already-used links share one error. Expiry is checked again after hashing and lock waits. The indexed expiry column supports future retention cleanup.

`lib/email.ts` exposes the provider-neutral `EmailTransport` interface and `sendEmail()` function. **Actual external delivery is the only intentionally deferred integration.** Local development defaults to `EMAIL_DELIVERY_MODE=console`. Production always returns HTTP 503 until a real transport is implemented; it never silently logs a reset email as delivered. Transport configuration is checked before account lookup, giving known and unknown addresses the same outage behavior. Delivery failures invalidate the newly generated grant. Normal reset-request responses use the same message for eligible, missing and disabled accounts.

Plug Resend, SendGrid, SMTP or another provider into `lib/email.ts` by implementing availability checking and sending; leave the token/service/API logic unchanged. Existing SMTP environment fields are reserved and are not consumed by the console transport.

## Guards, account editing and guests

`server/auth/guards.ts` provides `requireUser()` for server pages, `requireApiUser()` for API authentication, and `requireRole(allowedRoles)` for role-restricted APIs. `assertRole()` is the reusable core. Unauthorized APIs return 401; forbidden roles return 403 when serialized with `errorResponse`. Role lists are explicit: a MODERATOR-only list does not automatically include ADMIN. Use `["MODERATOR", "ADMIN"]` when both should have access.

`/account/layout.tsx` protects the account subtree; `/account/page.tsx` checks again where it reads data. Every future private route handler/server action must call its own guard; a layout is not API protection. Name edits write to the actual logged-in user's row, and the account page reads actual database profile values. Order History and Saved Addresses are explicitly labeled future sections, with no fabricated data.

Email changes are intentionally **deferred and blocked**, including by the profile API. A correct change flow must verify possession of the proposed address, preserve the current login until confirmed, handle uniqueness races and notify the previous address. Changing the login identifier without that proof risks account takeover. The profile UI explains the read-only state.

Guest checkout requires **no authentication or account creation**. In the later checkout phase, create `Order.userId = null` and store the guest's email, phone and shipping snapshot. Contact/email matching may help locate an order, but must not authorize access or automatically attach it to a User. Showing or claiming past guest orders needs a signed order-access link or verified email ownership; only then may a transaction attach them to an authenticated user. Authenticated checkout can set `userId` directly from the verified session.

## API map

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET / POST | Auth.js sessions, CSRF, credential callbacks and sign-out |
| `/api/auth/signup` | POST | Shared validation; 201 create / 409 duplicate / 400 invalid / 429 limited |
| `/api/auth/forgot-password` | POST | Uniform request acknowledgment; 429 limited / 503 delivery unavailable |
| `/api/auth/reset-password` | POST | Atomic single-use reset; 400 invalid or expired / 429 limited |
| `/api/account/profile` | PATCH | Authenticated name edit; 401 unauthenticated / 422 email change deferred |

Run `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Tests cover real Prisma/PostgreSQL constraints and auth service behavior, plus real Next.js HTTP handlers, Auth.js CSRF/cookies/JWT sessions and account pages. Test mail capture is an injected transport; production handlers never use it. PGlite tests run serially, use ephemeral local sockets, and do not modify your configured database. Native PostgreSQL/Docker concurrency testing remains an external validation step.
