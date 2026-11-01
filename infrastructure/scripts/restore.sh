#!/usr/bin/env bash
set -euo pipefail
: "${1:?Usage: restore.sh BACKUP_DIRECTORY --replace-destination}"
if [[ ${2:-} != --replace-destination ]]; then
  printf 'Restore replaces the destination database and files. Use an isolated Compose project and pass --replace-destination.\n' >&2
  exit 1
fi
backup_dir=$1
[[ -f "$backup_dir/database.dump" && -f "$backup_dir/attachments.tar" ]]
# The caller configures .env for the destination, preserving APP_ENCRYPTION_KEY.
docker compose stop api worker web >/dev/null
docker compose up -d --wait postgres >/dev/null
docker compose exec -T postgres pg_restore -U tendly -d tendly --clean --if-exists --exit-on-error < "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint sh api -c 'find /data/attachments -mindepth 1 -delete'
docker compose run --rm --no-deps -T --entrypoint tar api -C /data/attachments --no-same-owner --no-same-permissions -xf - < "$backup_dir/attachments.tar"
docker compose run --rm migrate
docker compose up -d --wait
