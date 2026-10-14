# Task editing and household planning

Stage 3 adds the first task and shared-entity mutations. Product behavior remains in
its existing specifications; this records the implementation boundary.

- One server module maps internal status/planning bucket to the six visible columns.
  Completion records the immediately preceding column. Dates remain local date/time
  values interpreted with the household IANA timezone; a date-only deadline expires
  at the next local midnight, including short/long DST days.
- Task versions include per-field revision metadata. A request supplies its observed
  version and only changed fields. Different-field edits merge against the latest
  row; stale changes to the same field return the latest task and conflicting fields.
  Date/time pairs are checked together. Undo uses the same guards, never a force write.
- Household row locks serialize task/reference changes and member removal. Access is
  checked again after acquiring the lock. Removing an assignment through member or
  entity deletion increments the affected task field's revision too.
- References use normalized join tables. Every submitted entity and assignee is
  checked against household membership and entity kind inside the transaction.
- Ordinary fields autosave after a short typing pause. Failed drafts remain in the
  editor with retry/conflict choices; closing waits for a successful save. Entity
  editors use explicit Save. There is no offline mutation queue.
- List reads filter before pagination using bounded scans and the same availability
  function as detail reads. Stage 5 will extend this boundary with the filter compiler;
  Stage 4 will add the authoritative inheritance/dependency resolver. Stage 3 does not
  independently duplicate these future rules in the browser.
- The theme uses twelve curated hues with paired OKLCH surfaces and monochrome
  foregrounds. A shared Radix dialog composition provides focus trapping and keyboard
  dismissal for both the desktop sheet and full-screen mobile editor.

Stage 3 refetches open lists periodically and on local changes/window focus. Full
WebSocket mutation propagation, reconnect reconciliation and expanded Undo history
remain Stage 7 work. Plain text descriptions become rich content in that stage.

General API traffic has a 300/minute allowance per validated user; anonymous traffic
retains 120/minute per source IP. In-login/recovery-specific tighter limits still apply.
Session lookup is reused within each request, and unverified cookie values never
create new limiter buckets. This prevents one person's autosave/refetch activity from
blocking another person's invitation behind the same reverse proxy.
