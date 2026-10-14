# Contributing to Tendly

Read [AGENTS.md](AGENTS.md) and its linked specifications before changing behavior.
Preserve the complete M1 VP scope. Ask for approval before making new product decisions.

Use focused commits and reviewable changes. Run `pnpm check`; run PostgreSQL integration
tests when persistence/migration behavior changes. Regenerate contracts when API schemas
change. Keep comments focused on why an invariant holds, not what obvious code does.

Never commit credentials, household data or personal deployment configuration. Use
`.env.example` only for non-secret documentation. Contributions are under
AGPL-3.0-or-later. Check new dependency/asset license compatibility and record notices.
