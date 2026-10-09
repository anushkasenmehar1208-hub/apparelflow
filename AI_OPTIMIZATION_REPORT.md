# AI Optimization Report

## 1. Tools & Prompting

This project used ChatGPT for requirement breakdown, architecture discussion, and plain-language explanations. An AI coding agent was used inside the repository to inspect the existing implementation, edit frontend and server code, run tests, exercise HTTP flows, query the configured database through existing project helpers, inspect the browser UI, and prepare documentation.

Prompts were constrained by one-day scopes and explicit safety rules. They required inspection before implementation, prohibited secret output and destructive database operations, and required actual lint, type, build, HTTP, database, and browser evidence before reporting success. AI assistance covered schema and architecture review, React UI implementation, Next.js Route Handlers, Prisma transactions, validation, role enforcement, automated tests, integration verification, contrast review, and documentation.

## 2. Flawed / Broken AI Code

### Database connection attempts hung

Early Prisma CLI attempts used ordinary PostgreSQL SSL negotiation in the local environment. Those commands hung or produced schema-engine failures, which could have been misread as invalid credentials or a broken Neon database. The same existing database authenticated through certificate-verified direct TLS, showing that the connection approach and environment were the problem.

### The early role prototype was only a browser control

The initial role-switching prototype used client state to decide which UI to display. Hiding a button in React is not authorization: a caller can still send a direct HTTP request. Leaving that design unchanged would have allowed protected operations without a server-verified identity and role.

### The default Turbopack verification path failed locally

The default Next.js production build first encountered restricted font network access and then a Turbopack worker error while binding an internal port. Repeating the same command would not prove the application build. The supported Webpack build path completed compilation, type checking, static generation, and route collection in this environment.

## 3. Human Refactoring

Database access kept the existing Neon adapter for application runtime. A narrowly scoped, certificate-verified direct-TLS helper was retained for local migration/status work where ordinary negotiation hangs. Raw errors are sanitized so connection details are not logged.

The browser-only role prototype was replaced with opaque HttpOnly demo sessions. Protected endpoints resolve the database user and role on every request. Cutting creation, verification, and sewing each enforce their own role on the server and ignore forged role or status fields from request bodies.

Input checks were shared where practical and repeated at the server boundary. Order creation uses a transaction for the order and component rows. Verification finalization uses a serializable transaction for the status update and immutable audit log. Approval recalculates its hard stop from persisted component rows. Sewing uses a conditional database update that succeeds only while the order is still `VERIFIED`.

Verification was expanded beyond compilation. Unit tests cover field validation and status rules. Integration scripts use production Route Handlers, assert HTTP authorization and transition failures, and then read Neon to confirm persisted rows and unchanged audit data. Browser checks verify the actual role-specific interfaces and readable control states.

## 4. Defensive Architecture

ApparelFlow treats the database as the source of truth for identity, order state, counts, and audit history.

- Only `CUTTING_SUPERVISOR` may create an order. The server derives its creator, `PENDING_VERIFICATION` status, and expected component quantities.
- Only `CUTTING_VERIFIER` may save actual counts or make a verification decision.
- Approval fails when any component is uncounted or RED. GREEN and YELLOW are allowed by the stated business rule.
- Approval and rejection update the order and create one immutable verification log in the same transaction.
- The Sewing Queue query includes a fixed database predicate for `status = VERIFIED`; pending, rejected, cutting, and already-started orders are never fetched for that queue.
- Only `SEWING_SUPERVISOR` may start assembly, and the server accepts only `VERIFIED → SEWING_STARTED`.
- Conditional updates and serializable transactions prevent duplicate or stale finalization from silently succeeding.
- Client-supplied role, creator, status, expected quantities, traffic status, verifier ID, and wastage are never treated as authority.

The demo role switcher is deliberately open and is not production authentication. Real deployment should replace it with authenticated user accounts and shared session storage while preserving the same server-side role and state-transition checks.
