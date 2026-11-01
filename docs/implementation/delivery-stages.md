# Tendly — approved eight-stage delivery plan

Approved by the owner on 2026-10-14; remaining delivery order revised by the owner
on 2026-11-01. These are internal checkpoints within the complete Milestone 1 VP,
not smaller releases. Stage 1 and Stage 2 were accepted on 2026-10-14; Stage 3 is
implemented with its review recorded separately. The sequencing decision does not
record a new acceptance of Stage 3 or completion of later stages.

**Approved order: 7 → 5 → 4 → 6 → 8. Stages 7 and 5 are implemented and locally tested; next: 4.**
See the [Stage 5 review](stage-5-review.md) for filters/views and verification, and the [Stage 7 review](stage-7-review.md) and [implementation plan](stage-7-plan.md) for work packages,
existing foundations, verification and the approved attachment policy.
Stage numbers remain stable identifiers, not execution order. Stages **7 and 5 are
the priority for meaningful household use and evaluation**. After both, review real
mobile/desktop usage and feed findings into subsequent work. This evaluation point
is not the M1 release gate; every remaining M1 requirement still applies.

| Stage (execution order) | Deliverable | Dependencies | Review and verification | Acceptance coverage |
|---|---|---|---|---|
| 1 | Specifications/reference, license, strict TS workspace, contracts, migration locking, containers, CI/release foundation | Plan approval | Clean build, contract regeneration, readiness failures, concurrent migrations, persistence after restart | Foundation for 01, 24, 25 |
| 2 | Bootstrap, passkeys, invitations, recovery, sessions, deployment/household roles, SMTP, isolation | 1 | Install → bootstrap → email → invite → recover; scoped access attacks | 01–03, 23 |
| 3 | Responsive/localized/themed shell, capture, six columns, ordinary properties, entity management, autosave/version guards | 2 | Phone/desktop capture/edit/complete/reopen; contrast/focus and concurrent fields | 04–05, 13, 21–23 |
| **7 — priority 1** | Rich text/comments/mentions, files/photos, search, full sync/conflicts/Undo for available workflows, remaining applicable settings | 3; later-domain integration assigned below | Multi-device daily journey, scoped files, reconnect and conflict safety | 19–23, with cross-stage scenarios completed below |
| **5 — priority 2** | Filter AST/builder/preview/history, quick bars, shared views, global ordering, Board interactions for available task model | 3 and Stage 7 sync/search foundations; Stage 4 integration below | Matching consistency, pagination, personal/shared state, accessible drag alternatives; household evaluation | 12–16, 21–23 where applicable |
| 4 | Hierarchy, inheritance, effective dependency graph, availability, warnings; integration with existing filters/views/search/sync/Undo | 3, 7, 5 | Deep trees, inherited exclusions, graph races, independent actionable children; existing views/preview/search agree on effective values | 06–12 and hierarchy-dependent parts of 14–16, 20–22 |
| 6 | Templates, recurrence, archive/Trash and safe worker jobs; integration with content/search/sync/Undo/settings | 4, 5, 7 | Clone/remap/retry, preserve instances, no parent archive with unfinished descendants, unresolved deleted blockers | 17–18, 20 and lifecycle-dependent parts of 19, 21–23 |
| 8 | Complete VP acceptance, usability/accessibility, backup/restore drill, release docs/images | All preceding stages | All M1 scenarios, fresh-host restoration, household review, no release blockers | 01–25 |

## Dependencies in the revised order

- Stage 7 delivers real content, attachments, activity, search and multi-device
  collaboration on the existing task model. Stage 5 adds shared filter evaluation
  to search and extends sync/conflict protection to filters/views. Stage 4 adds
  descendant search and hierarchy/dependency mutations; Stage 6 adds archived
  search, lifecycle settings and recurrence/archive/Trash synchronization and Undo
  where specified. Those integrations are explicit work in their owning stages.
- Stage 5 uses one authoritative server resolver/evaluator for current task values
  and date-based availability. Stage 4 extends that same path with inheritance and
  direct/ancestor dependency blockers across Now, Board, previews and search.
  Do not duplicate domain logic in UI or create a second filter engine.
- Stage 5 delivers column/epic moves, global ordering, lanes and their accessible
  alternatives. Stage 4 completes reparenting, subtask-as-card behavior, inherited
  card metadata and related warnings. Do not expose unfinished controls as working.
- Existing content, files, saved filters/views and personal state must survive
  subsequent migrations. Cross-stage acceptance scenarios remain open until their
  full behavior is verified; early evaluation does not waive the Stage 8 gate.

Concurrency protection begins with the first mutations, not at the final polish stage.
No extra agents are needed for the initial foundation.

## Review discipline

Use focused commits/PRs, protect critical behavior, and review actual mobile and desktop
flows. Do not create tests for trivial getters or target arbitrary coverage. Maintain
why-comments for graph, concurrency, filtering, recurrence and recovery invariants.

## Approved clarifications

- Deployment administrators and household administrators have separate authority.
- Household timezone governs dates/recurrence; date-only deadlines cover the local day.
  Missing calendar dates clamp to the last valid day; custom recurrence is every N
  days/weeks/months/years.
- Availability checks direct and ancestor-inherited blocker completion. Traverse
  transitively for cycle detection, not to impose extra availability blockers.
- Do not auto-archive completed parents with unfinished descendants. Permanently
  deleted blockers remain unresolved until explicitly handled.
- Global shared manual order; direct-child progress; all-descendant completion warnings.
- One effort day is eight hours. Exact duration may suggest an unassigned size, never
  overwrite an explicitly selected size.

No additional product decisions are introduced by this delivery plan. The product
specification remains the behavioral authority.
