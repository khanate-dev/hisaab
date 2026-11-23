#!/usr/bin/env bash
# Dumps the database at SUPABASE_DB_URL into <out-dir> as gzipped roles, schema and data (ADR-0011): the deploy
# snapshot and the nightly backup both take it.
set -euo pipefail
out=${1:?usage: db-dump.sh <out-dir>}
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL must be set}"
mkdir -p "$out"
pnpm exec supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$out/roles.sql"
pnpm exec supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out/schema.sql"
pnpm exec supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$out/data.sql"
gzip "$out"/*.sql
