# Tendly — Technical Architecture

**Version:** 1.0  
**Status:** Approved stack and architecture, consolidated 2026-10-14  
**Constraints:** Self-hosted; open standards; public AGPL-3.0-or-later GitHub repository; no vendor lock-in

> Product behavior belongs to the [Product Specification](../product/product-specification.md), visual rules to [UX/UI](../design/ux-ui-specification.md), and release scope to the [Implementation Plan](../implementation/implementation-plan.md). Avoid quietly changing product behavior to simplify backend design.

## 1. Principles and boundaries

Use the **simplest maintainable architecture that supports the approved business rules**. In particular, avoid moving authoritative filtering, availability or inheritance logic into React. The server enforces all access controls, computes task effective properties, evaluates dependency availability, applies saved filters and determines task lists.

The server is not tied to a managed authentication, database, file or storage provider. Use standard Docker deployment and migration tooling; all data and attachments remain movable. Future offline and extra storage providers must be feasible without implementing their complexity now.

## 2. Selected stack

| Concern | Selection | Notes |
|---|---|---|
| Workspace | pnpm monorepo | Apps and reusable packages |
| Client | React + TypeScript + Vite | Responsive installable PWA |
| Server | Node.js + Fastify | REST handlers and domain services |
| API contract | REST `/api/v1` + OpenAPI | Generated TypeScript client |
| Validation | Zod | Server input and domain schemas; OpenAPI generation consistent with contract |
| Database | PostgreSQL | Standard relational storage |
| ORM/migrations | Drizzle | Tracked, serialized migrations |
| Server-state cache | TanStack Query | Optimistic updates and invalidation |
| Change notification | WebSocket | Mutations remain REST calls |
| Job queue | pg-boss using PostgreSQL | No Redis |
| Styles/components | Tailwind CSS + shadcn/ui | Common accessible components |
| Icons | Lucide | Single coherent line-icon system |
| Rich text | Tiptap / ProseMirror | Structured document data |
| Localization | i18next | English, Swedish |
| Identity | WebAuthn / SimpleWebAuthn | Passkeys, email recovery |
| Tests | Vitest + Playwright + real PostgreSQL | Focus on critical invariants |
| Containers | Docker Compose | Works behind external Caddy or equivalent HTTPS proxy |
| Automation/release | GitHub Actions + GHCR | Public, version-tagged images |
| Future cloud backups | Restic + Rclone | Google Drive first, Dropbox too; **v1.3** |

Optional utilities should be justified on real needs; do not introduce Redis, managed Supabase, tRPC, PostgreSQL RLS or unnecessary distributed services in the initial build.

## 3. Repository layout

```text
apps/
  web/          # Vite React PWA
  api/          # Fastify API + WebSocket endpoints
  worker/       # pg-boss scheduled/background jobs
packages/
  shared/       # Zod schemas, types, domain constants, API contract
  ui/           # Shared visual primitives/components if needed
infrastructure/
  docker/       # Images, scripts, migration/backup helpers
docs/
  product/
  design/
  architecture/decisions/
  implementation/
compose.yaml
.env.example
AGENTS.md
LICENSE
README.md
```

Use domain modules inside `apps/api` (e.g., tasks, hierarchy, inheritance, dependencies, availability, filters, views, recurrence, accounts, households, files). Keep route handlers thin. Domain rules should be testable independently of HTTP.

## 4. Suggested relational model and invariants

The schema below describes logical entities, **not a mandate for exact table names**. Prefer explicit columns/relational tables for ordinary structured task data; use JSONB principally for the flexible saved-filter expression and editor state.

| Entity | Primary relations / notes |
|---|---|
| `users`, `passkey_credentials`, `sessions` | Email identity; WebAuthn credential metadata; revocable sessions |
| `households`, `memberships` | `user_id`, `household_id`, `role` (Admin/Member) |
| `tasks` | `household_id`, nullable `parent_id`, status, planning bucket, preceding column, title, content, dates, priority, effort, audit/version metadata |
| `epics` | Household, name, icon, palette hue, global sort, archived |
| `places`, `resources`, `tags` | Household-owned definitions, icon/color, optional geodata on places |
| `task_[places/resources/tags]` | Local additions/exclusions or equivalent normalized override storage |
| `task_assignees` | Explicit assignments plus inheritance/override marker as appropriate |
| `task_dependencies` | Blocking task ID -> blocked task ID; scope validation |
| `task_relations` | Canonical undirected pairs for `Related to` |
| `templates`, `recurrence_series`, `occurrences` | Shared template engine, recurrence rules, schedule instance uniqueness |
| `views`, `filters`, `filter_versions` | Household-defined views/filter JSONB, creators, history |
| `view_quick_filters` | View-specific ordering of reusable filter IDs |
| `user_view_state` | Personal favorites, active chips per view |
| `comments`, `attachments`, `task_activities` | Content and audit metadata, file paths not public URLs |
| `notification_settings` (v1.1) | Per-user preferences; delivery jobs |
| `app_settings`, `household_settings` | Defaults and secrets references, never plaintext credentials in responses |

### 4.1 Household isolation

Deployment-administrator privilege is distinct from household Admin and must be checked separately for installation-wide settings. Household Admin membership never implies deployment privilege.

All household-owned records are restricted through **centralized backend authorization**, not PostgreSQL RLS in v1. Every request must derive effective household membership server-side; never trust a client-provided household ID on its own. Scope reads **and writes**, joins, nested parent changes, WebSocket subscriptions, attachment retrieval and worker tasks. Verify cross-household denial with database-backed integration tests.

### 4.2 Workflow representation

```ts
type TaskStatus = 'todo' | 'in_progress' | 'done';
type PlanningBucket = 'someday' | 'within_year' | 'within_month' | 'ready';
type TaskColumn = 'someday' | 'within_year' | 'within_month' | 'todo' | 'in_progress' | 'done';
```

**Canonical derived column**:

- If `status==='done'`, column `done`.
- Else if `status==='in_progress'`, column `in_progress`.
- Else map `planningBucket: someday→someday, within_year→within_year, within_month→within_month, ready→todo`.

Maintain valid combinations via one domain-level `moveTaskToColumn` operation. The bucket survives work and completion so planning context is retained. Record the **immediate visible pre-Done column** on transition into Done, not the first-ever planning bucket. Reopen to that column, with a safe fallback if a record predates this feature. The UI and API filtering expose `TaskColumn` as a single user-visible field; never require editing status and bucket independently.

A separate `available`/`blocked` database field is **not** authoritative. Derive availability using the Product Specification's date/dependency constraints. Never move cards automatically because a date passed or a dependency changed.

### 4.3 Task tree (`parent_id`)

Use a nullable adjacency-list parent pointer and PostgreSQL `WITH RECURSIVE` queries to obtain ancestors/descendants. Reject cycles, moves into one's own descendant and cross-household reparenting **transactionally**. Avoid recursive N+1 queries; compute effective values for result sets with batched ancestors/joins/CTEs. There is no fixed depth cap in the product model (implementation must still defend against pathological requests/loads).

### 4.4 Inheritance as a domain operation

For **single-valued properties** (epic, earliest start, deadline, high priority), model three intentions: `INHERIT`, `EXPLICIT(value)`, `EXPLICIT_NONE` (or `EXPLICIT_FALSE` for priority). Storing SQL NULL alone is **insufficient** to distinguish intentional none from inherit. For assignees, allow dynamic inheritance and an explicit assignment override, including explicitly no assignees. Keep the implementation simple and clearly expose how to return to inherited values.

For **places, resources and tags**, calculate each effective set as:

`effective(child) = (effective(parent) − explicit_child_exclusions) ∪ explicit_child_additions`

This supports item-level add/remove, not replacing the entire inherited set, at arbitrary depth. Repeated add/remove operations must be deterministic. Local exclusions must survive subsequent parent edits; newly added parent values flow through. The same effective-property resolver is used by task APIs, filters, card summaries and dependency/availability rules.

Inherited **blocking dependencies** are aggregated from ancestors separately from local task dependencies. Availability checks completion of direct and ancestor-inherited blockers only; transitive traversal is for cycle detection, not availability. Do not copy parent edges into child rows. Any explicit early-start override remains valid (subject to dependencies): do not impose an unstated rule that the parent's workflow column or earliest-start value independently blocks the child after an explicit override.

### 4.5 Dependency graph and lifecycle

Store blocking edges with `blocking_task_id` and `blocked_task_id`, unique per ordered pair. Both endpoints must exist in one household; no self-edge. Validate not only explicit graph cycles but **effective cycles induced by ancestor-inherited edges**, and revalidate on task reparenting/edge edits. Use transaction boundaries/locking appropriately to prevent races where parallel graph updates create an invalid cycle. Allow starting blocked tasks only following the product warning; still compute them as blocked for Now-filter purposes. On reopening completed A, dependents' availability updates without moving their column.

Store `Related to` separately as undirected pairs with canonical ID ordering and uniqueness. It must not alter graph blocking logic.

## 5. Filter engine and query semantics

Store saved filter ASTs in PostgreSQL **JSONB**, with version entries and `created_by` metadata. A filter tree supports `AND`, `OR`, `NOT`, nested groups and typed leaf predicates. Example:

```json
{
  "type": "group",
  "operator": "AND",
  "children": [
    { "type": "predicate", "field": "column", "operator": "IN", "value": ["within_month", "todo"] },
    { "type": "predicate", "field": "size", "operator": "IN", "value": ["XS", "S"] },
    { "type": "predicate", "field": "available", "operator": "EQ", "value": true }
  ]
}
```

- Validate the AST with Zod: known field/operator pairings, value types, depth/node limits for abuse protection, dynamic tokens (Today, Current User, Current Place).
- **Never** build SQL by concatenating arbitrary field names, operators or values; compile from validated allowlists and parameterize all user values.
- Scope/filter at the server. For effective inherited properties, resolve them in batches within database queries or a bounded server filtering pipeline; pagination/sorting must operate on **fully filtered effective results**, not only raw rows from the current page.
- All view types, live previews and search-filter combinations use the **same evaluator**, so matching sets cannot disagree between Now, Board and custom views.
- A view's filter composition is exactly `base AND each active quick filter`; quick-filter availability/order is shared, personal on/off switches are stored per user/view. Editing a shared definition propagates to every reference and creates a restorable version. Prevent filter self-references/cycles if such references are introduced in the future; they are not required in v1.
- Expose `Column` to the builder, not internal status/planningBucket selectors. Display meaningful feedback if the Current Place token lacks a chosen place; avoid silently interpreting it as a physical location.
- Manual card order is shared globally and must remain stable under filtering and view switching; sorting by other properties is a presentation/query choice.

## 6. Templates and recurrence engine

Use one logical template tree format for normal and recurring task creation. A recurrence series defines schedule (daily/weekly/monthly/yearly/custom), advance-creation lead time (default **14 days**), and relative dates/deadlines. The worker materializes a new **complete task tree** for each occurrence and records an occurrence identity keyed by series + scheduled start, with a **uniqueness constraint** to make retried jobs idempotent.

When cloning a tree: first create a map `templateNodeId -> instanceTaskId` for every node; then copy **internal dependency edges** through the map. External targets keep their original IDs, subject to household validity; deleted/invalid external targets produce actionable warnings, not cross-household links. Changes to one occurrence are local. Changes to a series affect **future unmaterialized occurrences**; past/previously materialized instances are not silently rewritten. Existing historical instance content remains intact.

Backend tasks should not be auto-created multiple times merely because a worker restarted or a schedule was retried.

## 7. API, client caching and concurrency

All mutations run through versioned REST/OpenAPI, with Zod validation, authenticated and household-scoped handlers. Generate client types from the API contract rather than hand-maintaining duplicate DTOs. Use transactions for hierarchy/dependency/recurrence changes that must be atomic.

Use TanStack Query for remote data. Optimistic UI updates are allowed for low-risk operations if failures roll back and conflicts do not disappear. Broadcast changes via authenticated household-scoped WebSocket events; clients invalidate/refetch relevant queries. On reconnect, use REST to recover current state. Do not send authorization-sensitive events to clients outside their households.

### Optimistic concurrency

Use task versions/conditional writes (or equivalent optimistic revision tokens) to detect stale edits. Safe **different-field** concurrent changes can be merged. Conflicting **same-field** changes must surface an explicit resolution choice; never silently apply last-writer-wins to conflicting content. Undo must replay a guarded inverse change against the revision/field state, not overwrite someone else's later modification. Apply equivalent safeguards to critical shared filter/view edits where simultaneous edits could lose work.

For rich text in v1, no CRDT/OT co-editing is required. Treat the description as a logical editable field and handle overlapping edits as a conflict.

## 8. Authentication, access recovery and email

Use SimpleWebAuthn for WebAuthn registration/assertion. The relying-party ID/origin must match the stable **HTTPS hostname** configured by the installer; `localhost` is suitable only for local development. The owner's expected hostname is `tasks.terning.net`, **not a hardcoded default for other installs**.

Email-delivered invitations verify the recipient inbox. Owner-approved hand-delivered invitation codes are an explicit SMTP-independent exception: they expire after 30 seconds, are consumed transactionally once, and must never mark an email as verified. Verify expiry again when passkey enrollment completes. The **first-admin CLI-code bootstrap must work without SMTP**, and the bootstrap admin may verify email once SMTP is configured. Sessions use Secure, HttpOnly cookies with appropriate SameSite/CSRF protections, revocation and expiration. Support multiple passkeys. Do not implement a normal password sign-in path.

For recovery, send a short-lived one-use token/link to the registered verified email, enabling **new passkey enrollment**. Include rate limits, generic responses that do not enumerate accounts, replay protection and logging of recovery actions. Admin-assisted recovery requires suitable safeguards; deployment-owner emergency CLI recovery must not depend on working SMTP or UI. Recovery links effectively make control of the email account a recovery factor; document this risk.

### Initial setup

On an uninitialized DB, generate a one-use setup code, retrievable via Docker CLI. Limit its validity/reuse; successful setup creates first admin, their passkey and first household, then disables initial setup. Never publish the code to public web responses or source control.

### Email configuration

Deployment-administrator UI can configure SMTP server, port, TLS/STARTTLS, credentials, sender and send a test email without Docker restarts. Encrypt stored SMTP secrets at rest using application key material outside the DB (environment/secret volume), never return secrets in API responses and avoid logging them. If SMTP is unavailable during first setup, CLI bootstrap still works; email invitations/recovery explain SMTP prerequisites; household admins can instead create a 30-second invitation code without SMTP.

## 9. Background worker, files and lifecycle

### Worker

A separate Node.js process/container runs **pg-boss** against the PostgreSQL database, including recurrence generation, archive-after-30-days, Trash retention and eventual notification/backup scheduling. Jobs persist through restarts, retry safely and avoid duplicates. Notifications become active in **v1.1**; cloud backup work arrives **v1.3**. Avoid extra queuing infrastructure.

### Attachments

Store bytes in a persistent container volume; PostgreSQL stores ownership, path/key, mime type, size, metadata and task/comment association. Use authenticated scoped download endpoints, authorization checks on every read, validation of upload type/size, path traversal defenses and safe thumbnail handling. Serve previews without exposing the underlying host path. Keep the storage adapter replaceable in the future; do not store file bytes inside PostgreSQL.

### Archive / Trash

Archive after configurable completion-age threshold (default 30d), but never automatically archive a completed parent with unfinished descendants. Support search and restore. Permanently deleted blockers remain unresolved until explicitly handled. Soft delete subtree atomically; trash expiration defaults 30d. Only admins can intentionally perform immediate permanent deletion. Consider dependencies referencing trashed records during mutation and availability evaluation; do not silently treat deleted blockers as successfully completed.

## 10. Deployment and operations

One `compose.yaml` runs **web, API, worker and PostgreSQL**; persistent database/file storage; no required third-party hosted services. The public endpoint sits behind an existing external HTTPS proxy (e.g. Caddy); document proxy headers and WebSocket upgrade. Shipping must be compatible with macOS Docker on a Mac mini while remaining portable to other Docker hosts.

Use `.env.example` for non-secret example configuration and runtime env/secret volumes for actual credentials. Never commit keys or OAuth tokens. Keep app-level preference/configuration editable in the admin UI where specified; proxy hostname and bootstrap infrastructure can remain environment-level settings.

All releases have immutable/version-tagged GHCR images and GitHub releases; use semantic versioning. GitHub Actions runs build, typecheck, lint and focused tests on PRs. Track Drizzle schema migrations and run them **once per deployment** with a controlled leader/lock. No automatic production upgrades in early testing. Downgrading code does not guarantee reversing a DB migration; document recovery constraints.

Publish under **AGPL-3.0-or-later** with LICENSE, README, user install and contributor/developer docs; check third-party license compatibility.

### Backup scope

**v1.0:** provide repeatable commands for manual **consistent PostgreSQL dump**, attachment copy and restoration on a new Docker installation. The docs must identify what secrets/instance settings need preserving. This is adequate for initial data protection but not integrated cloud backup. Data portability does not rely on SaaS provider-specific APIs.

**v1.3:** integrate Restic+Rclone with both Google Drive and Dropbox, implemented Google Drive first. Backup a **transactionally consistent DB dump plus files**, with encrypted deduplicated snapshots, repository password/key exported separately, retention configurable (defaults daily 30, weekly 12, monthly 12), nightly 03:00 schedule, weekly integrity checks and admin failure alerts. Include CLI restore path independent of the running app and test a full disaster recovery restore. Future multiple storage destinations may be added but are not promised for v1.3.

## 11. Testing and agent-facing maintenance

Use **Vitest** for domain logic and PostgreSQL integration tests; use a **small number of Playwright journeys** for the product's most important end-to-end tasks. Protect hierarchy cycles, inheritance, effective filtering, recurrence edge remapping/idempotency, roles/household isolation and concurrent edits. Avoid testing trivial getters or duplicating every condition in UI tests. **No mandatory coverage percentage.** CI must pass for merges.

Explain domain invariants in concise inline comments **why**, not narrating obvious syntax. `AGENTS.md` points agents to product/UX/architecture/plan in precedence order and warns against adding features or arbitrary tests. Record meaningful architectural decisions in `/docs/architecture/decisions/`; avoid verbose process documentation.

## 12. Explicit non-goals for initial architecture

No proprietary managed backend, no Redis, no RLS v1, no tRPC, no collaborative rich-text CRDT/OT, no required App Store client, no full offline mutation engine, no automatically published production updates, no mandatory live GPS or push for v1.0, and no integrated cloud backup before v1.3. All these exclusions are scoped to approved milestones, not permanent bans on future development.
