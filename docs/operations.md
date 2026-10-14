# Tendly operations

Stage 2 provides account setup and household membership. This is not yet the complete M1 VP; task workflows and the full backup/restoration drill remain later stages.

## Build and start

Requires Docker/Compose. Copy `.env.example` to `.env`, set a strong URL-safe database
password (hex avoids connection-URL escaping), a separate 32-byte hex `APP_ENCRYPTION_KEY` (generate with `openssl rand -hex 32`), and your own HTTPS `PUBLIC_ORIGIN`. Preserve the encryption key with your backups; losing it makes saved SMTP credentials unreadable.
The repository contains no real secrets. Then:

```sh
docker compose up --build --wait
curl --fail http://127.0.0.1:8080/api/v1/health/ready
```

The web port binds to loopback by default. Place an external HTTPS reverse proxy in
front of localhost:8080. For a containerized proxy, join an appropriate network or bind
an explicitly chosen private interface; never expose PostgreSQL or the API directly.
Forward WebSocket upgrades through the outer proxy; the bundled web proxy already
supports them. PUBLIC_ORIGIN is the authoritative origin for WebAuthn, not
forwarded host input. Use a stable hostname; changing it impacts passkeys.

Compose starts PostgreSQL, waits for health, runs the locked migration job once, then
starts API/worker/web. Named volumes persist PostgreSQL and attachment storage. The attachment volume is writable by the non-root API user and its persistence is
checked in CI. Attachment upload/download routes arrive in Stage 7.

Check `docker compose ps` and `docker compose logs`. Health endpoints separate process
liveness from database readiness. Worker health requires a recent successful DB check.
API/worker handle termination signals. `docker compose down` preserves volumes;
**`docker compose down --volumes` destroys them** and is only appropriate for disposable
CI/development installations.

## Upgrades and release images

CI validates contracts, lint/types/build, focused tests, real PostgreSQL migrations,
and Compose build/restart checks. Version tags `vX.Y.Z` run these checks again before
publishing amd64/arm64 API/worker/web images to GHCR. No release images have been
published by Stage 1. Never reuse a released tag; record image digests in release notes.
Registry owners should restrict package/tag overwrite permissions.

For a future published version, set TENDLY_VERSION to its full tag, pull the images,
and run Compose without building. There are no automatic upgrades. Before upgrading,
back up the database, attachment files and required secrets. Recreate the one-shot
migration service for each deployment so a previous exited container is not mistaken
for the new migration run. Example after a backup:

```sh
docker compose pull
docker compose stop api worker web
docker compose run --rm migrate
docker compose up -d --no-build --force-recreate
```

A migration failure must be investigated before starting application services.
Downgrading code does not reverse schema changes. Restore a compatible backup instead
of assuming automatic rollback.

## Recovery commitment

M1 includes consistent manual PostgreSQL-plus-files export, required configuration/key
inventory, and restoration to a fresh Docker installation. Use a maintenance window to
pause writes/workers while capturing the dump and files. Validate records and file
contents after restoration. This is an acceptance gate, not a claim that Stage 1 has
already passed AC-24. Integrated encrypted cloud backup remains M4.

## First account and email

After startup, issue a private, 30-minute setup code:

```sh
docker compose exec api node apps/api/dist/accounts/cli.js setup-code
```

Enter it on the setup page, supply your name/email and household name/timezone, and
create a passkey. Issuing another setup code invalidates the previous one. Setup closes
after the first account is created. This account receives deployment administration
and administration of the initial household as separate privileges. Setup works
without SMTP; the first account email stays unverified until verification succeeds.

Open Email settings, supply your SMTP host/port, STARTTLS or TLS, optional credentials,
and sender address. Save, then send a test to your own email. SMTP transport requires
valid TLS certificates; passwords are encrypted in PostgreSQL, never returned by the API.
Next verify your email from Your account and invite household members from Household.
Invitation recipients verify their email by redeeming the one-use link. Existing
accounts sign in before accepting; an invitation cannot replace their passkeys.

Use HTTPS for real deployments. For a local-only preview, explicitly set
`NODE_ENV=development` and `PUBLIC_ORIGIN=http://localhost:8080`; HTTP is accepted only
for localhost. Passkeys are tied to the hostname. A phone using a LAN IP needs HTTPS
with a stable hostname, rather than an HTTP IP address.

## Account recovery and administration

Add a second passkey in Your account. Sessions can be revoked individually. Sensitive
changes require a passkey confirmation if the last authentication is older than ten
minutes. Recovery invalidates all previous sessions, adds a new passkey and consumes
outstanding recovery links. Review and remove lost or compromised old keys afterward.

Verified accounts can request a 15-minute one-use recovery email. The response does
not disclose whether an account exists. Household administrators can send that email
to an existing member's verified address; they cannot retrieve the recovery secret or
change the recipient. Deployment privileges never confer automatic household access.

If email is unavailable, the installation owner can recover a known account:

```sh
docker compose exec api node apps/api/dist/accounts/cli.js recover person@example.com
```

Deliver the printed one-use link privately to that account owner. CLI recovery can
also recover the initial, not-yet-verified administrator. Container/host access is a
trusted installation-owner capability. No recovery codes or passwords are introduced.

Manage deployment administrators independently via the CLI:

```sh
docker compose exec api node apps/api/dist/accounts/cli.js deployment-admin person@example.com grant
docker compose exec api node apps/api/dist/accounts/cli.js deployment-admin person@example.com revoke
```

These commands revoke the affected user's sessions and preserve at least one deployment
administrator. Household membership changes preserve at least one household administrator.
The last passkey cannot be removed. Security events record actions and account IDs,
without credential secrets. Session/token database values are hashes; links use URL
fragments and are removed from the address bar after capture.
