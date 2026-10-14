#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=${1:?Usage: restore.sh /absolute/path/to/backup-directory}
[[ "$backup_dir" = /* ]] || { echo 'Use an absolute backup directory.' >&2; exit 1; }
(
  cd "$backup_dir"
  if command -v sha256sum >/dev/null; then sha256sum --check checksums.sha256;
  else shasum -a 256 --check checksums.sha256; fi
)
# Refuse to overwrite a live installation. Restore into a fresh Compose project/volumes.
docker compose up -d --wait postgres
existing_tables=$(docker compose exec -T postgres sh -c 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('\''pg_catalog'\'', '\''information_schema'\'')"')
[[ "$existing_tables" = 0 ]] || { echo 'Restore refused: the target database is not empty.' >&2; exit 1; }
docker compose exec -T postgres sh -c 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --exit-on-error' < "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar api -xpf - -C /data/attachments < "$backup_dir/attachments.tar"
docker compose up -d --wait
echo 'Restore complete. Verify sign-in, household tasks, recurring series and attachment downloads.'
