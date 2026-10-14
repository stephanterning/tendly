# Tendly — approved eight-stage delivery plan

Approved by the owner on 2026-10-14. These are internal checkpoints within the complete
Milestone 1 VP, not smaller releases. Stage 1 was accepted by the owner on 2026-10-14. Stage 2 was accepted by the owner on 2026-10-14. Stage 3 was accepted by the owner on 2026-10-14, including place-map and icon-picker corrections. The owner authorized completing **all remaining work through VP 1.0.0** on 2026-10-14, without intermediate owner review gates. Stages 5–8 remain internal engineering checkpoints; the owner will review the complete VP.

| Stage | Deliverable | Dependencies | Review and verification | Acceptance coverage |
|---|---|---|---|---|
| 1 | Specifications/reference, license, strict TS workspace, contracts, migration locking, containers, CI/release foundation | Plan approval | Clean build, contract regeneration, readiness failures, concurrent migrations, persistence after restart | Foundation for 01, 24, 25 |
| 2 | Bootstrap, passkeys, invitations, recovery, sessions, deployment/household roles, SMTP, isolation | 1 | Install → bootstrap → email → invite → recover; scoped access attacks | 01–03, 23 |
| 3 | Responsive/localized/themed shell, capture, six columns, ordinary properties, entity management, autosave/version guards | 2 | Phone/desktop capture/edit/complete/reopen; contrast/focus and concurrent fields | 04–05, 13, 21–23 |
| 4 | Hierarchy, inheritance, effective dependency graph, availability, warnings | 3 | Deep trees, inherited exclusions, graph races, independent actionable children | 06–12 |
| 5 | Filter AST/builder/preview/history, quick bars, shared views, global ordering, full Board interactions | 4 | Matching consistency, pagination, personal/shared state, accessible drag alternatives | 13–16 |
| 6 | Templates, recurrence, archive/Trash and safe worker jobs | 4–5 | Clone/remap/retry, preserve instances, no parent archive with unfinished descendants, unresolved deleted blockers | 17–18, 20 |
| 7 | Rich text/comments/mentions, files/photos, search, full sync/conflicts/Undo, remaining settings | 3–6 | Multi-device daily journey, scoped files, reconnect and conflict safety | 19–23 |
| 8 | Complete VP acceptance, usability/accessibility, backup/restore drill, release docs/images | 1–7 | All M1 scenarios, fresh-host restoration, household review, no release blockers | 01–25 |

Stage 6 and content work in Stage 7 may overlap once ownership/lifecycle contracts exist.
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
