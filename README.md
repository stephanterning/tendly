# Tendly

A self-hosted household task manager: simple daily use, powerful planning when needed.
English/Swedish, mobile and desktop, and portable Docker deployment. Licensed under
[AGPL-3.0-or-later](LICENSE).

**Development status:** Stage 1 foundation. This is not yet the Milestone 1 Viable
Product. There are no account or task workflows yet. M1 retains the complete approved
scope; automatic GPS and notifications follow in M2, and integrated cloud backup in M4.

## Start here

- [Developer setup](docs/development.md)
- [Deployment and operations](docs/operations.md)
- [Approved delivery stages and acceptance mapping](docs/implementation/delivery-stages.md)
- [Stage 1 review](docs/implementation/stage-1-review.md)
- [Contributor guidelines](CONTRIBUTING.md)

## Specifications and precedence

1. [Product](docs/product/product-specification.md): behavior and invariants.
2. [UX/UI](docs/design/ux-ui-specification.md): visual language and interaction.
3. [Architecture](docs/architecture/technical-architecture.md): implementation constraints.
4. [Milestone plan](docs/implementation/implementation-plan.md): release scope.
5. [Acceptance criteria](docs/implementation/acceptance-criteria.md): observable checks.
6. [AGENTS.md](AGENTS.md): implementation guidance.

The [approved visual reference](docs/design/references/approved-visual-direction.png)
illustrates card surfaces, rhythm, spacing, and light/dark atmosphere. It is AI-generated;
written specifications override its labels, icons, navigation, and board layout.

The approved six columns, item-wise dynamic inheritance, advanced reusable filters,
recurrence, collaboration, recovery, and complete mobile experience remain M1 commitments.
See the product specification for the owner's October 14, 2026 clarifications. Product
changes require approval; private implementation choices should stay simple and portable.

## Repository

`apps/web` is React/Vite, `apps/api` is Fastify plus server domain modules,
`apps/worker` runs pg-boss, and `packages/shared` contains Zod/API contracts and the
generated client. PostgreSQL/Drizzle owns structured data; attachment bytes use a
persistent volume. Compose and release tooling live under `infrastructure`.
