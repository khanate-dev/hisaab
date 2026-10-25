#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

docker compose -f powersync/compose.yaml down
pnpm exec supabase stop
