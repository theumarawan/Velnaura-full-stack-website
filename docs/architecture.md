# ADR-001: Velnaura application and data foundation

Status: Accepted foundation baseline; the implemented auth phase supersedes future-auth notes below. See [authentication](authentication.md). Date: 2026-09-21. Deciders: project owner and implementation architect.

## Context and decision

Build a skincare DTC foundation in one Next.js App Router deployment, with Node.js route handlers and a PostgreSQL data layer accessed through Prisma. Store exact PKR decimal values. Allow guest checkout. Use Auth.js credentials in the later auth phase and Safepay as the selected payment gateway in the checkout phase. Keep business handlers, storefront pages and admin UI out of this deliverable.

The default application boundary is `/app` -> `/server` -> Prisma/PostgreSQL. Shared constants and contracts live in `/lib` and `/types`. `server/db.ts` uses `server-only` to prevent accidental imports into client bundles. `server/database.ts` is the Node-only factory also used by the seed. Connections initialize lazily so compilation does not require a database.

## Alternatives and consequences

| Decision | Chosen approach | Alternative / trade-off |
| --- | --- | --- |
| Backend | Next route handlers in Node | Separate service adds deployment/API overhead without a current boundary requiring it |
| Money | PostgreSQL Decimal(12,2), PKR enum | Integer minor units also work; exact decimals keep SQL reporting legible. Never calculate money with JS floating point |
| Order history | Typed shipping fields and item price/name/SKU snapshots | Joining live addresses/catalog would rewrite history after edits |
| Catalog deletion | Restrict purchased product/variant deletion; deactivate instead | Nullable references permit hard deletion but weaken auditability |
| Authentication | Auth.js credentials, application-owned User, future JWT sessions | Managed auth adds a separate identity dependency. Credentials requires application-owned signup, hashing, verification and reset logic |
| Payments | Safepay as gateway, manual transfer/COD separately | Direct JazzCash/Easypaisa integrations require their own onboarding, signatures and callback processing |
| Address defaults | PostgreSQL partial unique index plus deferred existence check | An application-only check can race and allow duplicate or missing defaults |

Credentials users must be persisted by the application; Auth.js does not automatically create them. The future implementation will use JWT sessions for credentials, so this schema intentionally has no unused Account/Session adapter models. Identity/profile/password hashes remain in PostgreSQL. Roles must be checked against current database state for privileged operations. Disabling an account and password changes need session invalidation policy in that phase.

Safepay's public API, private API and webhook keys form the active gateway contract. Do not assume a payment method is enabled for the merchant simply because it appears in the enum: confirm JazzCash/Easypaisa availability and activation with Safepay onboarding. Direct provider credentials are optional fallbacks requested by the brief, not a second active integration. No external accounts or payment actions are created here.

## Later-phase boundaries

Implement auth signup/verification/reset, rate limiting and secure hash verification when that phase is approved. Implement checkout transactions, stock reservations, expiring unpaid orders, legal status transitions, payment attempts, verified webhook inbox/idempotency and refund records before enabling payment traffic. The current Order reference represents one accepted payment reference; it is not a complete payment-attempt ledger. Add those models with migrations alongside that implementation.

Content documents are editable JSON in PostgreSQL, with schema version and optimistic revision fields. The future admin writer must validate rich-text structure, sanitize rendering and compare-and-increment revision atomically. The current database checks document object shape, not a specific editor library's grammar.

## Sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Prisma PostgreSQL setup](https://www.prisma.io/docs/getting-started)
- [Auth.js credentials](https://authjs.dev/getting-started/providers/credentials)
- [Safepay credentials](https://safepay-docs.netlify.app/developers/safepay/api-keys/)
- [PGlite socket testing](https://pglite.dev/docs/pglite-socket)

