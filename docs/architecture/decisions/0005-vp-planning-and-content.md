# VP planning, recurrence, content and synchronization

Saved filter definitions are typed, bounded expression trees. The compiler uses
allowlisted fields/operators and parameterized operands over the same effective task
snapshot used by cards/details. View base and personally enabled quick filters combine
with AND before sorting/pagination. Definitions and chip placement are household-owned;
toggles/favorites/current place are per-user/per-view. Shared mutations have revision
guards. Filter history stores immutable definitions, restored through a new revision.

Template trees use stable source identifiers. Each materialization assigns fresh IDs,
remaps internal dependency edges and retains external blockers. Dates use offsets from
an occurrence date; every calendar occurrence is calculated from the original anchor.
A household transaction and unique (template, date) key make retries idempotent.
Housekeeping uses the same graph for unfinished-descendant checks. Trash records keep
a deletion-root identity so restore does not silently resurrect unrelated prior deletions.

Rich text is a Tiptap JSON document serialized in the existing text field; legacy plain
text becomes a text node. Server validation allows known nodes/marks and safe links,
checks household mentions and image references, and never evaluates stored HTML. File
bytes use opaque UUID names in the persistent volume. SQL owns association/permissions;
uploads commit metadata only after bytes exist, and delayed orphan cleanup avoids
racing active uploads. Downloads are authenticated, non-cacheable and MIME-restricted.

Database triggers advance a household revision for committed changes. WebSockets poll
that revision and send content-free invalidation signals after a fresh session and
membership check, including after session revocation. Clients refetch the authoritative
REST state and reconnect with backoff. This works across multiple API processes without
in-memory-only broadcast state. Mutation conflicts remain field-aware on tasks;
rich-text same-field edits require explicit resolution rather than concurrent merging.

Manual backup pauses both writer services and exports PostgreSQL plus attachment bytes
at one recovery point. Restore accepts only an empty target and checks file checksums.
