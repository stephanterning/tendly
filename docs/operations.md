# Tendly operations

This guide covers the self-hosted VP 1.0.0, including first setup, everyday operation and manual recovery.

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
checked in CI. Authenticated attachment routes support files, images and profile photos.

Check `docker compose ps` and `docker compose logs`. Health endpoints separate process
liveness from database readiness. Worker health requires a recent successful DB check.
API/worker handle termination signals. `docker compose down` preserves volumes;
**`docker compose down --volumes` destroys them** and is only appropriate for disposable
CI/development installations.

## Upgrades and release images

CI validates contracts, lint/types/build, focused tests, real PostgreSQL migrations,
and Compose build/restart checks. Version tags `vX.Y.Z` run these checks again before
publishing amd64/arm64 API/worker/web images to GHCR. Check GitHub Releases for published tags; a local development build is not a registry release. Never reuse a released tag; record image digests in release notes.
Registry owners should restrict package/tag overwrite permissions.

For a published version, set TENDLY_VERSION to its full tag, pull the images,
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

## Recovery

Use the manual backup and recovery scripts below. The complete export includes the
database, attachment volume and separately preserved configuration/secrets.

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
Email invitation recipients verify their email by redeeming the one-use link. Existing
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

## Invite without SMTP

In Household, enter the recipient email and role and choose Create invitation code,
then Copy invitation code. The code expires **30 minutes after creation**, works once
and does not require SMTP. Share it privately with the intended recipient. They open
the same Tendly installation and use Have an invitation code? on the sign-in screen
(or in Your account if already signed in). New users register a passkey; existing users
must sign into the matching account. Joining must finish within the 30-minute window.
If it expires during passkey setup, create a fresh code and try again.

The recipient address remains unverified. Verify it separately after configuring SMTP
to enable email recovery. The UI shows remaining time and lets you select/copy manually
if browser clipboard access is denied. A browser cannot retract a code already copied
to the clipboard, but server expiration and one-use consumption remain authoritative.

## Place maps

See [optional place maps](operations/maps.md) for tile-provider configuration,
self-hosted tiles, attribution and network behavior.

## Manual backup and recovery (v1.0)

Run these commands from the repository directory containing `compose.yaml`. Use the
same `.env`, Compose project name and image version as the running installation.

```sh
bash infrastructure/scripts/backup.sh /absolute/path/to/tendly-backup-2026-10-14
```

The script stops API and worker writes, takes a PostgreSQL custom-format dump, archives
the attachment volume (including profile photos), records image versions and checksums,
and restarts the writers even if the backup fails. Expect a short maintenance window.
The backup contains private household data; store it with restricted access on a
separate device. It is not encrypted by this script.

Preserve `.env` separately and securely, especially `APP_ENCRYPTION_KEY` (needed to
read encrypted SMTP configuration), database credentials, `PUBLIC_ORIGIN`, Compose
project name and image version. Passkeys are tied to the hostname: keep the original
HTTPS hostname when moving hosts. The database includes accounts, credentials, shared
filters, views, templates, recurrence deduplication records and job state. File bytes
live in the attachments archive; neither half alone is a complete backup.

On a fresh compatible host, obtain the matching Tendly version, restore the protected
`.env`, and pull/build its images before running:

```sh
bash infrastructure/scripts/restore.sh /absolute/path/to/tendly-backup-2026-10-14
```

Restore verifies checksums and refuses a non-empty destination database. Use new
Compose volumes/project for a drill; never remove the source installation's volumes.
Only restore trusted backups. The script restores PostgreSQL and files, then runs the
normal migration/start sequence. If an interrupted restore leaves a partial database,
start again with a new empty destination. Verify passkey sign-in or CLI recovery,
household membership, representative tasks, shared views, series and a downloaded
attachment. Keep the source backup until that verification succeeds.

Code downgrades do not reverse database migrations. Recover onto the backed-up image
version and data together. Automated/cloud backup, retention scheduling and encryption
configuration in the UI remain v1.3 work.

## Everyday operation

- **More → Views and filters:** create shared Board/List views, visual filter rules,
  restore filter versions, select quick chips and personal favorites. Current Place is
  manually selected; no live GPS is used.
- **Task details → Save as template / series:** capture the whole subtree. Series
  creation runs every minute, normally 14 days ahead. Calendar dates clamp from the
  original anchor, and job retries retain one occurrence per scheduled date.
- **More → Archive and Trash:** restore records; household administrators configure
  completion age and Trash retention, or explicitly delete permanently. Missing
  dependency targets stay unresolved. Parent tasks with unfinished descendants are
  not automatically archived.
- Attachments are limited to 16 MiB each. Recognized PNG/JPEG/GIF/WebP files have inline
  previews; other files download as attachments. Files are authenticated on every
  request and never put in the service worker cache. Orphan bytes are cleaned after a
  one-day safety period so cleanup cannot race an in-flight upload.
- Install Tendly from the browser's app/home-screen menu over HTTPS. It is online-first;
  the offline screen offers reconnection and does not queue edits. WebSocket revision
  signals refresh shared data, with automatic reconnect and scoped access rechecks.
