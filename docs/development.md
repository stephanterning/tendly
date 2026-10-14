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
`DATABASE_URL`, a 32-byte hex `APP_ENCRYPTION_KEY`, `NODE_ENV=development` and `PUBLIC_ORIGIN=http://localhost:5173` in your shell. Do not commit
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


## Focused browser journey

`pnpm test:e2e` runs a single Chromium journey using a virtual authenticator. The
server verifies genuine WebAuthn registration/assertion payloads; it is not mocked.
The journey covers first setup, verified email, invitation, mobile light/dark settings,
role isolation, email recovery, session revocation, login and CLI recovery without SMTP.

Use an isolated Compose project whose name contains `test`, on port 8081:

```sh
pnpm exec playwright install chromium
bash infrastructure/scripts/test-mailbox.sh
export COMPOSE_PROJECT_NAME=tendly-accounts-test
export COMPOSE_FILE=compose.yaml:compose.test.yaml
export NODE_ENV=development PUBLIC_ORIGIN=http://localhost:8081 HTTP_PORT=8081
# Set APP_ENCRYPTION_KEY and POSTGRES_PASSWORD to disposable test values.
docker compose up --build --wait
pnpm test:e2e
docker compose down --volumes
```

The journey requires an empty database. The final command destroys only this
explicitly named test project's volumes. The test mailbox binds localhost:8025 and
uses a temporary trusted TLS certificate. It never sends to an external mail server.
Screenshots and disposable certificates are ignored under `test-results/`; browser
traces are disabled so one-use authentication links are not stored in traces.
Account integration tests create/drop their own random databases and require a
test PostgreSQL role with database-creation privileges.
