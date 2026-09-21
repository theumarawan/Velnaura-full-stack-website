# Velnaura — foundation and authentication

Next.js App Router, strict TypeScript, Tailwind CSS, Node route handlers, PostgreSQL, Prisma and Auth.js credentials. PKR only. Phase 2 includes signup, login, single-use password reset, JWT sessions, role guards and the account shell. `/` is the public welcome/guest entry; `/api/health` checks the real database.

See [authentication behavior and limitations](docs/authentication.md) for password policy, rate limits, email delivery, profile editing and guest-order ownership. Payment integrations and commerce UI remain later phases.

## Folder map

```text
/app         # Next.js route handlers, required HTML shell and Tailwind entry stylesheet.
/lib         # Shared validation/constants and the server-only email transport interface.
/components  # Reusable auth, profile and brand-shell UI.
/server      # Database access, auth services, guards, tokens and rate limiting.
/prisma      # Annotated schema, versioned SQL migrations and idempotent development seed.
/types       # Shared application response contracts, separate from generated database types.
/scripts     # Runnable local configuration setup; never overwrites an existing .env.
/tests       # Database constraint and seed integration checks using disposable PostgreSQL WASM.
/docs        # Architecture decisions, schema rules and later-phase integration boundaries.
/generated   # Ignored Prisma client code; created by pnpm db:generate, never edited manually.
```

`/admin` remains deferred: future routable admin pages belong in `/app/admin`, with UI in `/components/admin` and operations in `/server`. `/public` is deferred until genuine product assets exist. Root files configure Next.js, TypeScript, ESLint, Tailwind/PostCSS, pnpm and local PostgreSQL.

## Clean-clone setup

Prerequisites: Node.js **24 LTS**, **pnpm 11.19.0**, and Docker Desktop/Engine with Compose v2. A normal Node installation includes npm; install the pinned package manager once:

```sh
npm install --global pnpm@11.19.0
```

From the cloned repository directory, run these commands in order (PowerShell, macOS or Linux):

```sh
pnpm install --frozen-lockfile
pnpm exec tsx scripts/setup-env.ts
docker compose up -d --wait db
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The configuration script copies `.env.example`, generates a random Auth.js secret and distinct seed passwords, and opts into local development seeding. It preserves existing `.env` files. If you already have one, configure its database URLs and seed settings manually using the documented contract. Test accounts are `customer@velnaura.test` (CUSTOMER) and `admin@velnaura.test` (ADMIN); their passwords are the values in your private `.env`. Sign in at `/login`. Pre-existing Phase 1 scrypt hashes upgrade to bcrypt on successful login; new seeds use bcrypt cost 12.

Open [database readiness](http://localhost:3000/api/health): expect HTTP 200 and `{"status":"ok","database":"up"}`. Database failure returns HTTP 503 without connection details. Auth requires `AUTH_SECRET`, `APP_URL` and `AUTH_URL` (created by the setup script). Payment credentials remain unused. Stop PostgreSQL with `docker compose stop db`; its named volume preserves data.

If using an existing PostgreSQL server instead of Docker, create an empty development database and role, configure `DATABASE_URL` and `DIRECT_URL`, then run the same generate/migrate/seed commands. The development seed intentionally accepts loopback hosts only and refuses `NODE_ENV=production`.

## Validation and production build

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Tests apply the committed migrations to disposable PGlite PostgreSQL databases, exercise the actual seed and auth services, and run a Next.js HTTP server to verify CSRF, cookies, JWT sessions, protected pages and profile APIs. They do not use or reset your configured database. PGlite is test-only; production and the documented development stack use PostgreSQL. Multi-process concurrency and Docker operation still need native PostgreSQL checks in CI.

For a schema change, create a migration with `pnpm db:migrate:dev --name descriptive_change`, review its SQL, then run `pnpm db:generate`. Use `pnpm db:migrate` to apply committed migrations. **Do not use `prisma db push`**: partial indexes, CHECK constraints and deferred triggers are defined in SQL migrations and are part of the data contract. Migration creation requires a role that can create a shadow database; deployment only needs permissions on the target database.

Prisma generation and the Next build do not require a running database. Next loads `.env`; Prisma CLI and seed load it explicitly. Production must supply its own database URLs via deployment secrets and run migrations before serving requests. The readiness endpoint checks connectivity, not migration currency.

## Seed content

- Three draft products: supplied flagship Mugtea Cleanser, plus development concepts Cloudveil Moisturiser and Dewdrop Serum; two sizes/SKUs each.
- All prices, sizes, inventory, addresses and the two additional product identities are development fixtures, not approved commercial claims.
- Two test users, two fictional saved addresses with one default, and JSON document blocks for `our-story`, `science` and `ritual` using **Serious Science, Delightful Delivery**.
- Passwords are salted bcrypt hashes at cost 12; no plaintext passwords enter the database. Existing seed passwords/roles are preserved on rerun.
- Re-running the seed preserves existing products, stock, roles, hashes and edited content. It creates missing fixtures using stable unique keys; it does not reset an edited database.

See [the schema](prisma/schema.prisma), [database rules](docs/data-contract.md), [architecture decision](docs/architecture.md) and [environment contract](.env.example).


## Authentication entry points

- `/signup` — account creation with shared password validation.
- `/login` — rate-limited credential sign-in.
- `/forgot-password` and `/reset-password` — signed, expiring, single-use reset grants.
- `/account` — real profile details/name editing; Order History and Saved Addresses are explicitly deferred sections.
- `/` — public welcome page, reachable through Continue as guest without an account.

Email delivery is the one intentionally deferred integration. In development, reset emails print to the server console. Production reset requests return 503 until `lib/email.ts` is connected to a provider. Email-address editing is disabled until a verified change flow is implemented. Initial signup does not verify email ownership.

## Source structure

```text
/app/                         # Public/auth pages, protected account shell and HTTP endpoints.
  layout.tsx, globals.css, page.tsx, error.tsx
  login/page.tsx, signup/page.tsx
  forgot-password/page.tsx, reset-password/page.tsx
  account/{layout,page,error}.tsx
  api/health/route.ts
  api/auth/[...nextauth]/route.ts
  api/auth/{signup,forgot-password,reset-password}/route.ts
  api/account/profile/route.ts
/components/auth/             # Shared brand shell, credential forms and profile form.
  auth-shell.tsx, auth-form.tsx, profile-form.tsx
/lib/                         # Shared validation/constants; server-only email delivery boundary.
  currency.ts, email.ts, auth/validation.ts
/server/                      # Database clients and framework-independent auth services.
  database.ts, db.ts
  auth/{errors,guards,http,password,rate-limit,reset-token,roles,runtime,service}.ts
/prisma/                      # Annotated models, seed and versioned migrations.
  schema.prisma, seed.ts
  migrations/migration_lock.toml
  migrations/20260921000100_initial/migration.sql
  migrations/20260921000200_invariants/migration.sql
  migrations/20260921000300_authentication/migration.sql
/types/                       # Shared health response and Auth.js type augmentation.
  health.ts, auth.d.ts
/scripts/                     # Non-destructive local environment setup.
  setup-env.ts
/tests/                       # Database, auth service and actual HTTP integration tests.
  test-database.ts, database.test.ts, auth.test.ts, auth-http.test.ts
/docs/                        # Architecture, data rules and authentication decisions.
  architecture.md, data-contract.md, authentication.md
/generated/prisma/            # Ignored, reproducible Prisma client output.
/auth.ts                      # Auth.js credentials/JWT configuration and session callbacks.
```

Root configuration files: `.env.example`, `.gitignore`, `compose.yaml`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `prisma.config.ts`, `tsconfig.json`. Next.js generated `AGENTS.md` and `CLAUDE.md` contain framework guidance. Local `.env`, `next-env.d.ts`, `.next`, `node_modules` and TypeScript metadata are ignored runtime/build artifacts.
