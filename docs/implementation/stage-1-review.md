# Tendly — Stage 1 review

Status: Stage 1 implemented and verified; ready for owner review.

## Delivered

- Named Tendly specifications, approved image, license, owner clarifications and complete
  eight-stage VP delivery/acceptance map.
- Pinned pnpm/Node workspace, strict TypeScript, React/Vite development page, thin
  Fastify health/version routes, Zod/OpenAPI generation and typed client.
- Drizzle schema/migration, session advisory locking, PostgreSQL-backed pg-boss process,
  readiness checks, persistent Compose volumes, non-root runtime services.
- CI for local checks, generated-contract drift, PostgreSQL concurrent migrations, and
  container startup/restart persistence. Multi-platform versioned GHCR/GitHub release
  workflow, developer/operator documentation and dependency license inventory.

## Verification

[CI passed for implementation commit 920eb49](https://github.com/stephanterning/tendly/actions/runs/38580382184):

- Build, lint, strict typecheck and three focused HTTP/configuration tests.
- OpenAPI regeneration with no drift in committed client contracts.
- Real PostgreSQL concurrent migration runners and repeat-application persistence.
- Fresh Compose build/start, API/worker/web readiness, and restart persistence of both
  database records and file bytes written by the non-root API user.

Local checks also pass. Runtime dependency audit reports zero known vulnerabilities;
303 installed dependency license declarations are inventoried. The supplied design
reference is byte-identical to the original. A container startup hook-ordering bug
found by CI was corrected and covered by the application teardown test.

The local Mac has no Docker/PostgreSQL runtime, so container verification ran on Linux
amd64 in GitHub CI. The release workflow prepares amd64/arm64 images; arm64 execution,
actual GHCR publication and a real HTTPS/physical-device installation have not yet
been exercised. No release tag or production deployment was created. No task or account
features are claimed complete. AC-24 full restoration remains a final VP gate.

## Review points

Inspect the product clarifications and design reference; review repository boundaries,
configuration, migration/release flow, and the linked CI evidence. Stage 2 starts only
after this checkpoint is accepted. Full M1 scope and focused testing remain unchanged.
