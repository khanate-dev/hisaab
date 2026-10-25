#!/usr/bin/env bash
# Serves the Edge Functions with `supabase functions serve` and checks the health function answers.
# `functions serve` replaces the stack's edge runtime container; restart the stack (`pnpm stack:down && pnpm stack:up`) to get it back.
set -euo pipefail
cd "$(dirname "$0")/../.."

log=$(mktemp)
pnpm exec supabase functions serve >"$log" 2>&1 &
serve=$!
trap 'kill $serve 2>/dev/null || true; wait $serve 2>/dev/null || true; rm -f "$log"' EXIT

if ! api=$(pnpm exec supabase status --output json 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0)).API_URL'); then
	echo "The local stack isn't running; start it with \`pnpm stack:up\`." >&2
	exit 1
fi
url="$api/functions/v1/health"
for _ in $(seq 60); do
	# Only trust a response once `functions serve` owns the runtime, not the edge runtime `supabase start` runs.
	if grep -q "Serving functions on" "$log" && body=$(curl --silent --fail --max-time 2 "$url") && [[ $body == '{"ok":true}' ]]; then
		echo "health: $body"
		exit 0
	fi
	sleep 1
done

echo "Edge Functions did not serve $url within 60s" >&2
cat "$log" >&2
exit 1
