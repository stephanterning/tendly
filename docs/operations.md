# Tendly operations — Stage 1

This is a development foundation, not the M1 release. Passkey bootstrap, household
workflows, backup commands and the full restoration drill are later approved stages.
Do not place household data into this build.

## Build and start

Requires Docker/Compose. Copy `.env.example` to `.env`, set a strong URL-safe database
password (hex avoids connection-URL escaping), and set your own HTTPS `PUBLIC_ORIGIN`.
The repository contains no real secrets. Then:

```sh
docker compose up --build --wait
curl --fail http://127.0.0.1:8080/api/v1/health/ready
```

The web port binds to loopback by default. Place an external HTTPS reverse proxy in
front of localhost:8080. For a containerized proxy, join an appropriate network or bind
an explicitly chosen private interface; never expose PostgreSQL or the API directly.
Forward WebSocket upgrades through the outer proxy; the bundled web proxy already
supports them. PUBLIC_ORIGIN is the authoritative origin for later WebAuthn, not
forwarded host input. Use a stable hostname; changing it impacts passkeys.

Compose starts PostgreSQL, waits for health, runs the locked migration job once, then
starts API/worker/web. Named volumes persist PostgreSQL and attachment storage. No
attachment uploads exist yet; writable attachment ownership is established with the
file-service implementation before enabling uploads.

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
