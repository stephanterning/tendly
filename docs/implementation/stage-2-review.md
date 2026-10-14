# Tendly — Stage 2 review

Status: implemented; local verification passed. Owner review is the next checkpoint.
Stage 3 has not started. The complete Milestone 1 VP scope remains unchanged.

## Delivered

- One-time CLI bootstrap without SMTP, passkey enrollment/login, multiple keys,
  revocable sessions and recent-authentication checks for sensitive operations.
- Email verification, household invitations, email and administrator-assisted recovery,
  plus installation-owner CLI recovery when email is unavailable.
- Separate deployment and household privileges, membership administration, multi-household
  account membership/switching, protected REST and WebSocket household scopes.
- Installation-wide SMTP configuration, encrypted secrets, TLS delivery and a durable
  encrypted recovery-mail queue. No password authentication or backup codes.
- Responsive English/Swedish account screens, light/dark/system themes, native accessible
  form controls and Lucide icons. Full task navigation/component system remains Stage 3.
- Operator instructions covering keys, bootstrap, recovery and deployment administration.

## Verification

Local macOS ARM64 checks passed:

- Build, lint, strict typecheck; four focused unit/HTTP checks.
- Six PostgreSQL integration checks covering migration races/persistence, household
  isolation, deployment privilege separation, WebSocket authorization, encrypted SMTP
  credentials, one-use/expired invitation tokens, generic recovery responses, rejected
  forged enrollment, final-admin protection and scoped session revocation.
- One Chromium journey using a virtual authenticator and actual server WebAuthn
  verification: setup → configure TLS SMTP → verify email → invite → mobile settings →
  email recovery → old-session invalidation → passkey login → CLI recovery without SMTP.
- Fresh Docker builds/migrations and healthy API, worker, PostgreSQL and web services.
- Desktop setup and mobile light/dark screenshots inspected; no horizontal clipping.
- Runtime dependency audit found no known vulnerabilities.

The browser test uses a localhost-only Mailpit instance; no mail was sent externally.
Virtual authenticators exercise the protocol, but real Safari/iOS/Android passkey
prompts and a production HTTPS hostname still require device review before the VP gate.

## Local review

The existing preview at http://localhost:8080 is updated, preserving its database and
attachment volumes. The private ignored .env now selects the existing
tendly-stage1-review Compose project and a localhost development origin. The historical
.env.stage1 is retained but should not be used for current account workflows.

No personal account was created for the owner. Generate a setup code in the repository:

    docker compose exec api node apps/api/dist/accounts/cli.js setup-code

Enter the code on the page and register a real passkey. Setup works before configuring
SMTP. Do not change the hostname after enrollment without considering passkey binding.
The separate tendly-stage2-test installation is disposable and uses synthetic accounts.

Review setup/login, account settings, household invitations/roles and the recovery
instructions. Task cards, capture, six columns and the full themed navigation belong to
Stage 3; task planning controls are deliberately not presented as working functionality.
