# ApparelFlow ERP — Day 1

Next.js 16, TypeScript, Tailwind CSS, Prisma 7.10.0, and the existing Neon PostgreSQL database. Day 1 includes a relational schema, two garment recipes with ten components, and a basic landing page. Later production workflows are not implemented.

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

The build generates Prisma Client but never migrates or seeds the database. The static homepage remains a Day 1 skeleton. `GET /api/health` performs only `SELECT 1` through the existing Neon adapter and returns success/failure without credentials or application data. It checks the environment at request time, returns HTTP 503 if unavailable, and is not cached.

Render's environment settings replace local environment files in the deployed service; do not upload or commit `.env.local`. Changes to host variables apply on the next deployment. GitHub pushes to main trigger deployments after the service is linked.

See the reports under `docs/` for tested outcomes. Earlier Vercel reports describe the unsuccessful attempts before the switch to Render.
