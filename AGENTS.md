# Instructions for Coding Agents

Read this file **and all linked specifications** before making product-affecting changes.

## Product intent

Build a polished, portable, self-hosted household task manager that is **simple on the surface and powerful underneath**. Avoid generic enterprise/project-management clutter. The family must be able to use **Milestone 1 as a complete Viable Product (VP)**; do not silently downgrade to an MVP.

## Sources of truth

1. [Product Spec](docs/product/product-specification.md) — functional behavior and invariants.
2. [UX/UI Spec](docs/design/ux-ui-specification.md) — visual language, interaction, responsive and accessibility rules.
3. [Technical Architecture](docs/architecture/technical-architecture.md) — tech stack, security, domain boundaries.
4. [Implementation Plan](docs/implementation/implementation-plan.md) — scope *by milestone*; future functionality is not required in v1.0.
5. [Acceptance Criteria](docs/implementation/acceptance-criteria.md) — observable checks, not a request for thousands of tests.

Written requirements override AI-generated reference-image labels. If an ambiguous issue would change product behavior, **ask the owner**, do not invent a new column, priority, field or entire workflow.

## Implementation standards

- Strict TypeScript, readable modules, thin HTTP routes; domain logic on the server.
- REST + OpenAPI, PostgreSQL + Drizzle, Fastify, React/Vite, pg-boss, Docker Compose. Use approved stack unless there is a justified design review.
- Consistently enforce authenticated household access **on every operation**, including file downloads, worker jobs and WebSocket scopes.
- Keep one authoritative resolver for effective inheritance, availability/dependencies, filter evaluation and column mapping. Never duplicate these rules in UI components.
- Avoid redundant state that can diverge; use transactional validation for tree and dependency edits.
- Prefer standard open formats, simple deployment and documented recovery over managed vendor services.
- Implement domain changes and migrations in reviewable PRs; do not ship UI controls that pretend unfinished features are functional.
- Use clear names, small functions and **short comments explaining non-obvious why/invariants**. Do not write comments that only restate obvious code.

## High-risk invariants worth testing

- Cycles and cross-household references are rejected.
- Item-level dynamic inheritance (`parent effective − child exclusions + child additions`) is correct through deep descendants.
- Task availability obeys effective dates and all ancestor dependency blockers, independently of user-facing column.
- Exactly **six** columns; user sees one `Column` field and completion reopen restores the immediate prior column.
- Server filter AST uses validated parameterized compilation, matching effective inherited values; view base + active quick filters combine via AND.
- Recurrence trees remap **internal** edges to new instances, preserve **external** edges and deduplicate job retries.
- Concurrent edits do not silently destroy same-field changes, and Undo does not clobber newer edits.
- Passkeys/session recovery and household isolation remain secure.

## Testing philosophy

Protect **behavior, not implementation details**. Use focused Vitest domain/database integration tests and a **small number of high-value Playwright journeys**. No blanket coverage percentage, no tests for trivial getters, no copy-pasted tests for every UI badge. CI requires lint/typecheck/build/relevant tests to pass. Make sure each release's UX is actually usable, not merely unit-test green.

## Visual and scope safeguards

- No `Waiting` column, no three/four-level priority selector. Priority is High or none, and is **not an epic lane**.
- Task cards show soft epic-colored backgrounds and monochrome icon/text variants per theme. **XS–XL** precedes precise time estimates visually.
- A **place** is a named physical location (e.g. Sandvreten); Outdoors is better represented as a tag.
- Quick-filter chips are **saved, shareable, expressive filters** with per-view presence and per-user toggle state.
- **v1.0:** manual place selection, no live GPS, no push delivery, no integrated automated cloud backup. **v1.1:** GPS + notifications. **v1.3:** Restic/Rclone Google Drive and Dropbox backup.

## Definition of done for changes

A change is done when relevant user behavior works on mobile and desktop, errors are handled, business invariants remain true, focused tests pass, and documentation is updated **only where a real decision or interface changed**. For the milestone as a whole, consult the acceptance scenarios and insist on the coherent, production-usable VP gate.

## Owner clarifications — 2026-10-14

Deployment privileges are separate from household Admin. Use household timezone, clamp missing recurrence dates to the last valid day, and support every N days/weeks/months/years. Availability checks direct and ancestor-inherited blockers only; transitive traversal detects cycles. Never auto-archive a completed parent with unfinished descendants; permanently deleted blockers remain unresolved. Manual ordering is global; progress counts direct children, warnings inspect all descendants. An effort day is 8 hours; exact estimates never overwrite explicitly selected sizes. See the authoritative product specification and approved eight-stage delivery plan.
