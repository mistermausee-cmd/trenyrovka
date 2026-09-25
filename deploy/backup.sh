#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${TRENYROVKA_INSTALL_DIR:-/opt/trenyrovka}"
cd "$INSTALL_DIR"
exec /usr/bin/docker compose exec -T app node dist/server/server/cli-backup.js
