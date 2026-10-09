# ApparelFlow ERP

ApparelFlow is a four-day software engineering internship project for a small garment-production workflow. It uses one Next.js application for the browser UI and server Route Handlers, with Prisma connecting the server to an existing Neon PostgreSQL database.

## Stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7.10 with the official Neon adapter
- Neon PostgreSQL
- Vercel/Render-compatible Next.js deployment

## Architecture and workflow

The application keeps authorization, validation, state transitions, and database writes in server Route Handlers. The browser displays role-specific workspaces and sends user input, but it does not decide protected roles or order statuses.

1. A Cutting Supervisor creates an order from a database recipe. The server creates its expected component rows and assigns `PENDING_VERIFICATION`.
2. A Cutting Verifier records actual component counts. The server derives GREEN, YELLOW, or RED status for each count.
3. The verifier may approve only when every component is counted and none is RED. Approval sets `VERIFIED`; rejection requires a note and sets `REJECTED`. Both decisions create an immutable verification log.
4. A Sewing Supervisor sees a database-isolated queue of `VERIFIED` orders. Starting assembly performs the only allowed sewing transition: `VERIFIED → SEWING_STARTED`.

Protected changes use transactions and conditional status updates so stale or repeated requests cannot silently repeat a transition.

## Database

The existing Prisma schema contains six related models:

- `User`
- `Recipe`
- `RecipeComponent`
- `CuttingOrder`
- `VerificationItem`
- `VerificationLog`

The seed ensures two recipes and ten components: Casual Blouse (`REC-BL01`) and Crop Top (`REC-CT02`). It is transactional, repeatable, preserves existing IDs, and deletes nothing.

Order statuses are `CUTTING_IN_PROGRESS`, `PENDING_VERIFICATION`, `REJECTED`, `VERIFIED`, and `SEWING_STARTED`.

## Demo roles

The homepage contains a demo role switcher for:

- **Cutting Supervisor** — creates cutting orders.
- **Cutting Verifier** — counts components and approves or rejects pending orders.
- **Sewing Supervisor** — sees verified orders and starts sewing assembly.

There are no typed passwords in this internship demo. Selecting a role creates or loads its disabled-login demo database user and issues an opaque HttpOnly, SameSite=Strict session cookie. The server reloads that user's database role for protected requests.

This mechanism is intentionally limited. Anyone who can access the demo can select any demo role. Sessions live in one server process for eight hours, disappear after restart, and are not shared across multiple instances. A production system should use real authentication and a shared session store.

## Local setup

Use Node.js 22.22.2, or another release supported by the installed Next.js version.

```sh
npm ci
npm run db:generate
npm run dev
```

Open the local URL printed by Next.js and select a demo role.

### Environment variables

Create `.env.local` with the existing Neon connection string:

```text
DATABASE_URL=your-existing-neon-postgresql-connection-string
```

Never prefix this variable with `NEXT_PUBLIC_`. It is server-only. `.env.local` and all `.env*` files are ignored and must not be committed, printed, or uploaded.

## Commands

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run db:validate
npm run db:verify
```

The production build generates Prisma Client. It does not migrate, seed, or query the database.

On restricted local networks, ordinary PostgreSQL SSL negotiation may hang. The existing certificate-verified direct-TLS helper is available only for migration deployment, status, and the documented drift check:

```sh
npm run db:deploy:direct-tls
npm run db:status:direct-tls
node scripts/prisma-direct-tls.mjs migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Do not expose the helper's ephemeral loopback listener publicly.

### Integration verification

Run these only against the intended test/demo database. They create clearly labeled permanent test rows and delete nothing.

```sh
npm run check:day3
npm run check:day4
```

`scripts/check-day2.ts` is the earlier Day 2 integration check. Day 3 and Day 4 checks cover the current complete workflow, authorization failures, validation, database persistence, audit logs, queue isolation, and illegal state transitions.

## API and security behavior

- `POST /api/demo-session` selects one of the three allowed demo identities.
- `GET /api/recipes` returns database recipes and components.
- `POST /api/cutting-orders` requires `CUTTING_SUPERVISOR` and derives creator, status, and expected quantities on the server.
- `GET /api/verification-orders` returns only `PENDING_VERIFICATION` orders to `CUTTING_VERIFIER`.
- `PATCH /api/verification-items/:id` persists a verifier count and server-derived traffic status.
- `POST /api/verification-orders/:id/decision` atomically finalizes verification and creates its audit log.
- `GET /api/sewing-orders` requires `SEWING_SUPERVISOR` and queries the database with `status = VERIFIED`.
- `POST /api/sewing-orders/:id/start` accepts only the `VERIFIED → SEWING_STARTED` transition.
- Mutation endpoints require same-origin JSON requests.
- Missing sessions receive `401`; authenticated wrong roles receive `403`; illegal transitions receive `409`; approval hard stops receive `422`.

The server never trusts client-provided role, creator, protected status, expected count, verification status, verifier identity, or wastage percentage.

## Deployment

GitHub currently records [apparelflow-five.vercel.app](https://apparelflow-five.vercel.app/) as the public homepage. It returned HTTP 200 on 9 October 2026, but still served the Day 1 skeleton at that check. It is not the final Day 4 deployment until the reviewed local changes are committed, pushed, redeployed, and tested.

The project can run on Vercel or a Render Node web service connected to this repository and the existing Neon database. Render settings previously used for this project are:

- Build: `npm ci --include=dev && npm run build`
- Start: `npm start -- --hostname 0.0.0.0 --port $PORT`
- Environment: private `DATABASE_URL` and the configured Node version

Vercel detects Next.js and uses the repository build script. On either host, configure `DATABASE_URL` privately. The build does not run migrations or seeds, and `.env.local` is never uploaded.

## Reports

- `AI_OPTIMIZATION_REPORT.md`
- `docs/DAY2-REPORT.md`
- `docs/DAY3-VERIFICATION.json`
- `docs/DAY4-REPORT.md`
- `docs/DAY4-VERIFICATION.json`
