# Tendly development

Use Node 24.19.0 and pnpm 11.25.0. Install pnpm using your preferred Node package manager.
Install Docker with Compose for database/container tests; it is not bundled with Tendly.

```sh
pnpm install --frozen-lockfile
pnpm api:generate
pnpm check
```

`pnpm check` builds dependency packages first, then lints, typechecks and runs focused
unit/HTTP tests. No coverage quota. Generated API files are committed; after a route
contract change run `pnpm api:generate` and review the diff. Do not hand-edit generated
DTOs. If changing Zod schemas, regenerate before running the full build.

For local processes, start a dedicated PostgreSQL database (see Compose), then set
`DATABASE_URL` and `PUBLIC_ORIGIN=http://localhost:5173` in your shell. Do not commit
real credentials. Run `pnpm db:migrate`, then in separate terminals:

```sh
pnpm --filter @tendly/api dev
pnpm --filter @tendly/worker dev
pnpm --filter @tendly/web dev
```

Vite proxies `/api` to localhost:3000. Workspace packages must be rebuilt after shared
contract/config edits. Environment files are not automatically loaded by server scripts.

## Database changes

Edit `apps/api/src/db/schema.ts`, run `pnpm db:generate`, and review generated SQL and
snapshot together. Commit both. Apply with `pnpm db:migrate`. Do not use schema push
against production and never rewrite already deployed migrations.

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost/tendly_test pnpm test:integration
```

Use a dedicated test database. The integration test fails rather than silently skips
when its database URL is missing. It checks concurrent migration runners and persistence
through repeated migration execution. CI also restarts the Compose services to test
persistent data and API readiness.
