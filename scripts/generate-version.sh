#!/usr/bin/env bash
set -euo pipefail

timezone="${VERSION_TIMEZONE:-Europe/Amsterdam}"
run_number="${VERSION_RUN_NUMBER:-${GITHUB_RUN_NUMBER:-0}}"
version_date="$(TZ="$timezone" date '+%Y.%m.%d')"
build_date="$(TZ="$timezone" date '+%Y-%m-%dT%H:%M:%S%z')"
commit="${VERSION_COMMIT:-${GITHUB_SHA:-}}"

if [ -z "$commit" ]; then
  commit="$(git rev-parse HEAD 2>/dev/null || true)"
fi

commit="${commit:-unknown}"

printf '{\n  "version": "%s.%s",\n  "date": "%s",\n  "commit": "%s"\n}\n' \
  "$version_date" "$run_number" "$build_date" "$commit" > version.json
