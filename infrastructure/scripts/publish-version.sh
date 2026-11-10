#!/bin/sh
# Assign a version to a previously published commit image without rebuilding it.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
image=$1
revision=$2
version=${3:-}
digest=$(sh "$ROOT/image-digest.sh" "$image:sha-$revision")
if [ -z "$digest" ]; then
  echo 'The commit image has not finished publishing.' >&2
  exit 1
fi
if [ -n "$version" ]; then
  case "$version" in
    *[!A-Za-z0-9.-]*) echo 'Invalid version tag.' >&2; exit 1 ;;
  esac
  if [ "${#version}" -gt 128 ] || ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$'; then
    echo 'Use a version such as v1.2.3 or v1.2.3-rc.1.' >&2
    exit 1
  fi
  existing=$(sh "$ROOT/image-digest.sh" "$image:$version")
  if [ -n "$existing" ] && [ "$existing" != "$digest" ]; then
    echo 'Version already points to a different image; publish a new version.' >&2
    exit 1
  fi
  if [ -z "$existing" ]; then
    docker buildx imagetools create --tag "$image:$version" "$image@$digest"
  fi
  actual=$(sh "$ROOT/image-digest.sh" "$image:$version")
  test "$actual" = "$digest"
fi
printf 'Image `%s@%s` (commit `%s`)\n' "$image" "$digest" "$revision"
