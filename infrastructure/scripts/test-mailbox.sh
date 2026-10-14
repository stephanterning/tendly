#!/usr/bin/env bash
set -euo pipefail
# Trust a throwaway local SMTP certificate instead of disabling TLS verification.
mkdir -p test-results/smtp
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj '/CN=mailpit' -addext 'subjectAltName=DNS:mailpit' \
  -keyout test-results/smtp/key.pem -out test-results/smtp/cert.pem >/dev/null 2>&1
chmod 644 test-results/smtp/key.pem test-results/smtp/cert.pem
