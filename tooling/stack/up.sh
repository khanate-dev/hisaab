#!/usr/bin/env bash
# Starts the local backend: Supabase (CLI) then the self-hosted PowerSync Service (Docker Compose).
set -euo pipefail
cd "$(dirname "$0")/../.."

keys=supabase/signing_keys.json
if [[ ! -s $keys ]]; then
	# Local-only ES256 key, so tokens match prod's asymmetric signing and PowerSync can verify them via JWKS.
	echo "[]" >"$keys"
	pnpm exec supabase gen signing-key --algorithm ES256 --append </dev/null
fi

pnpm exec supabase start
docker compose -f powersync/compose.yaml up --detach --wait
