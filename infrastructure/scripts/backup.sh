#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=${1:?Usage: backup.sh /absolute/path/to/new-backup-directory}
[[ "$backup_dir" = /* && ! -e "$backup_dir" ]] || { echo 'Choose a new absolute backup directory.' >&2; exit 1; }
mkdir -p "$backup_dir"
# Stop writers to keep PostgreSQL and attachment bytes at the same recovery point.
# PostgreSQL remains running; this is not a raw copy of its data directory.
docker compose stop api worker
trap 'docker compose start api worker >/dev/null' EXIT
docker compose exec -T postgres sh -c 'pg_dump --format=custom --no-owner --username="$POSTGRES_USER" "$POSTGRES_DB"' > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar api -cpf - -C /data/attachments . > "$backup_dir/attachments.tar"
docker compose images --format json > "$backup_dir/images.json"
(
  cd "$backup_dir"
  if command -v sha256sum >/dev/null; then sha256sum database.dump attachments.tar images.json > checksums.sha256;
  else shasum -a 256 database.dump attachments.tar images.json > checksums.sha256; fi
)
echo "Backup complete: $backup_dir"
echo 'Keep the original .env (especially APP_ENCRYPTION_KEY and PUBLIC_ORIGIN) separately and securely.'
