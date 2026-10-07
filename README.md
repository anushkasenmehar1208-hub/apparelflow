# ApparelFlow ERP — Days 1 and 2

Next.js 16, TypeScript, Tailwind CSS, Prisma 7.10.0, and the existing Neon PostgreSQL database. Day 1 includes a relational schema, two garment recipes with ten components, and a basic landing page. Day 2 adds demo roles and cutting order creation; later production workflows are not implemented.

## Local setup

Use Node.js 22.22.2 (the tested version) or a compatible supported release.

```sh
npm ci
npm run db:generate
npm run dev
```

Keep your existing `DATABASE_URL` in `.env.local`. Do not print it, commit it, or prefix it with `NEXT_PUBLIC_`. CLI scripts load `.env.local` explicitly; hosting environment variables take precedence.

## Database

The Prisma schema is unchanged. Its physical PostgreSQL tables use the existing Prisma model names: `User`, `Recipe`, `RecipeComponent`, `CuttingOrder`, `VerificationItem`, and `VerificationLog`.

```sh
npm run db:validate
npm run db:deploy
npm run db:seed
npm run db:verify
```

On the tested network, ordinary PostgreSQL SSL negotiation hangs. The existing database works using verified direct TLS. Use the local helper when applying/checking migrations from this network:

```sh
npm run db:deploy:direct-tls
npm run db:status:direct-tls
node scripts/prisma-direct-tls.mjs migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

The helper opens an ephemeral listener on `127.0.0.1`, forwards to the same Neon endpoint using certificate-verified TLS, and closes afterward. The loopback hop is plaintext; the outbound database connection is encrypted. Do not expose this listener publicly. It allows only deployment, status, and the documented read-only drift check. No shadow database is created. Prisma Client scripts use the official Neon adapter over secure WebSockets instead.

The seed is transactional and repeatable. It updates the two recipe definitions, preserves existing component IDs/image URLs, creates missing required components, and deletes nothing. Existing duplicate component names cause a failure instead of silent repair. Wastage caps use percentage points (`5.00` means 5%). No component images were supplied, so new image URLs are null.

## Day 2 demo roles and cutting orders

The existing page now loads recipes/components from `GET /api/recipes`. Select a demo role; only the Cutting Supervisor sees the creation form. Target quantity updates each component's expected pieces immediately. Submitting saves an order with `PENDING_VERIFICATION` and its component verification items in one transaction.

`POST /api/demo-session` selects one of the three demo identities and creates its database `User` on first use. No password login is provided; the required password-hash field contains a disabled-login marker. An opaque random token is stored in an HttpOnly, SameSite=Strict cookie, Secure on HTTPS. The server stores its user ID and expiry and resolves the user's database role for every order request. `POST /api/cutting-orders` ignores client role, creator, status, and expected quantities and computes those itself. Both POST endpoints require same-origin JSON requests.

**This is an open internship demo, not real authentication. Anyone can deliberately select the supervisor demo role.** The order endpoint still denies sessions for the other two roles, absent sessions, and forged tokens. Session storage is in memory, lasts eight hours, and is suitable for the current single-instance demo: restarting the app invalidates sessions, and multiple instances would need shared session storage or real authentication. Do not treat this as private factory access control.

Validation is shared by frontend/server: required fields; positive whole-number batch quantities within PostgreSQL Int limits; positive fabric with no more than two decimals within Decimal(10,2); roll IDs up to 100 characters; existing recipe with valid components; no component-count overflow. Numeric JSON inputs and form strings are supported. Fabric decimals are passed as strings to Prisma to preserve precision.

```sh
node --import tsx --test lib/order-validation.test.ts
# Run after a production build. Writes two permanent labeled test orders to the configured database:
node_modules/.bin/tsx scripts/check-day2.ts
```

The integration script checks recipe loading, authorization, forged request fields/cookies, cross-origin rejection, invalid inputs, and actual persisted order/component values. It leaves its test rows in place and records IDs in `docs/DAY2-VERIFICATION.json`. Do not blindly retry a submission after a network failure: the save may have succeeded even if the response was lost. Day 2 does not add a general idempotency/retry workflow.

No Day 3 approval/rejection/verification logic or Day 4 sewing workflow is implemented. No schema migration is required for Day 2.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`build` generates the ignored Prisma Client before compiling Next.js. It does not query Neon, run migrations, or seed the database. No secret is required just to build the static landing page.

## Cloud deployment (Render)

The deployment target is now Render. Use one free Node web service connected to this GitHub repository's main branch, with the existing Neon database:

- Build command: `npm ci --include=dev && npm run build`.
- Start command: `npm start -- --hostname 0.0.0.0 --port $PORT`.
- Node version: `22.22.2` (set `NODE_VERSION` in Render).
- Secret environment variable: `DATABASE_URL` (set privately in Render; use the existing Neon connection).

The build generates Prisma Client but never migrates or seeds the database. The homepage includes the Day 2 demo role switcher and cutting order form. `GET /api/health` performs only `SELECT 1` through the existing Neon adapter and returns success/failure without credentials or application data. It checks the environment at request time, returns HTTP 503 if unavailable, and is not cached.

Render's environment settings replace local environment files in the deployed service; do not upload or commit `.env.local`. Changes to host variables apply on the next deployment. GitHub pushes to main trigger deployments after the service is linked.

See the reports under `docs/` for tested outcomes. Earlier Vercel reports describe the unsuccessful attempts before the switch to Render.
