#!/usr/bin/env bash
set -euo pipefail
curl --fail http://127.0.0.1:8080/api/v1/health/ready
# Disposable CI installation only: demonstrate persistence across process restarts.
id=$(docker compose exec -T postgres psql -U tendly -d tendly -Atq -c 'INSERT INTO installation DEFAULT VALUES RETURNING id')
docker compose restart postgres api worker web
docker compose up --wait --wait-timeout 120
actual=$(docker compose exec -T postgres psql -U tendly -d tendly -Atq -c "SELECT id FROM installation WHERE id = '$id'")
test "$actual" = "$id"
curl --fail http://127.0.0.1:8080/api/v1/health/ready
