# Effective task graph and write serialization

Tasks retain local scalar values plus explicit inheritance flags. Existing Stage 3
rows keep their values, with no inherited flags. Entity additions and exclusions use
separate join tables; deleting an entity removes both and advances affected local
field revisions. Effective values are computed, never copied into descendant rows.

A single server resolver performs iterative parent-first inheritance and reverse-order
progress aggregation. It handles deep valid trees without recursive JavaScript calls.
Blocking edges are expanded through ancestry for Kahn cycle validation. Availability
only reads completion of those effective blockers, not their transitive dependencies.
Related links use canonical unordered pairs and advance both endpoints' local relation
versions when changed.

All graph writers acquire the household row lock, recheck membership, validate references,
write tentatively and validate the resulting effective graph within the transaction.
Reparenting first checks descendants with a household-scoped recursive CTE. An invalid
hierarchy or effective cycle rolls back the entire change, including version/activity
updates. Missing blocker IDs intentionally survive target deletion and remain unresolved.

Reads use a repeatable-read snapshot and batched household joins, without ancestor N+1
queries or an arbitrary depth/task cap. The resolver currently loads one household's
graph per request; memory grows with household size and inherited sets. This favors
consistency for the current household workload. Stage 5's filter compiler must retain
this authoritative effective-value boundary while improving query selection if needed.
Pagination is applied after effective availability filtering. No derived state is stored
as an independently editable database truth.

Task responses distinguish effective top-level fields, local edit intent, inherited
parent values, path/progress and blocker metadata. Editors submit local intent and Undo
restores that intent, avoiding accidentally replacing inheritance with copied values.
