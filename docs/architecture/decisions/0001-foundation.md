# 0001 — Tendly foundation boundaries

Status: implemented for Stage 1, 2026-10-14.

Keep the approved stack. Node 24 and pnpm are pinned for repeatable local/CI/container
builds; the lockfile pins dependencies. Use strict TypeScript workspace packages and
compiled ES modules in containers. API domain modules stay server-side; shared code
contains contracts, not a second browser implementation of business rules.

Zod route schemas feed Fastify validation/serialization and OpenAPI. Generate client
types from that contract and use openapi-fetch for typed calls. CI regenerates both
artifacts and rejects drift. The contract generator builds the server without opening
ports or contacting PostgreSQL.

Drizzle owns tracked SQL migrations. A dedicated Compose migration job holds a
PostgreSQL session advisory lock while Drizzle applies migrations. API/worker start
only after success; failed migrations block startup. Do not execute concurrent
migrations implicitly from API replicas. The initial table is installation metadata;
account/domain tables wait for their approved stages.

pg-boss has its own schema lifecycle; its startup remains behind application migrations.
Worker heartbeat is refreshed only after a successful database query. No future domain
jobs are simulated. Readiness returns a generic failure response and liveness only
checks the running process.

Public health/version routes expose no household data. Authorization for all future
domain routes is Stage 2. Request logging omits raw URLs/query strings and credentials.
Use a configured public origin rather than trusting arbitrary forwarded host headers.

Runtime images initially retain workspace dependencies for straightforward module
resolution. They run as non-root users. Pruning can be measured later without changing
product behavior. Publish amd64 and arm64 images; never automatically deploy them.

References: [Fastify schemas](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[Drizzle migrations](https://orm.drizzle.team/docs/migrations),
[pg-boss](https://github.com/timgit/pg-boss).
