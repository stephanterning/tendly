#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${1:?Usage: backup.sh NEW_BACKUP_DIRECTORY}"
backup_dir=$1
mkdir "$backup_dir"
# Stop every writer so the database and file copy describe the same instant.
restore_services() { docker compose start api worker web >/dev/null; }
trap restore_services EXIT
docker compose stop api worker web >/dev/null
docker compose exec -T postgres pg_dump -U tendly -d tendly --format=custom > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar api -C /data/attachments -cf - . > "$backup_dir/attachments.tar"
cp .env "$backup_dir/config.env"
printf 'Backup written to %s (includes secrets; keep private).\n' "$backup_dir"
