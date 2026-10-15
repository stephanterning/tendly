#!/usr/bin/env bash
set -euo pipefail
origin=${SMOKE_ORIGIN:-http://127.0.0.1:8080}
curl --fail "$origin/api/v1/health/ready"
# Disposable CI installation only: demonstrate persistence across process restarts.
id=$(docker compose exec -T postgres psql -U tendly -d tendly -Atq -c 'INSERT INTO installation DEFAULT VALUES RETURNING id')
docker compose exec -T api node -e "require('node:fs').writeFileSync('/data/attachments/ci-persistence.txt', 'tendly')"
docker compose restart postgres api worker web
docker compose up --wait --wait-timeout 120
actual=$(docker compose exec -T postgres psql -U tendly -d tendly -Atq -c "SELECT id FROM installation WHERE id = '$id'")
test "$actual" = "$id"
curl --fail "$origin/api/v1/health/ready"
docker compose exec -T api node -e "if(require('node:fs').readFileSync('/data/attachments/ci-persistence.txt','utf8')!=='tendly')process.exit(1)"

# Force an address change while leaving nginx running, like an API-only upgrade.
api_id=$(docker compose ps -q api)
api_image=$(docker inspect --format '{{.Config.Image}}' "$api_id")
network=$(docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{end}}' "$api_id")
old_ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$api_id")
holder="${api_id:0:12}-old-address"
trap 'docker rm -f "$holder" >/dev/null 2>&1 || true' EXIT
docker compose rm -sf api
docker run -d --name "$holder" --network "$network" --ip "$old_ip" --no-healthcheck "$api_image" node -e 'setInterval(() => {}, 1000)'
docker compose up -d --no-deps --wait --wait-timeout 120 api
new_ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(docker compose ps -q api)")
test "$old_ip" != "$new_ip"
curl --fail --retry 12 --retry-all-errors --retry-delay 1 "$origin/api/v1/health/ready"
curl --fail "$origin/api/v1/auth/status"
curl --fail "$origin/api/v1/auth/session"
