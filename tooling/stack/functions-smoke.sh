#!/usr/bin/env bash
# Serves the Edge Functions with `supabase functions serve` and checks the health function answers.
# `functions serve` replaces the stack's edge runtime container; restart the stack (`pnpm stack:down && pnpm stack:up`) to get it back.
set -euo pipefail
cd "$(dirname "$0")/../.."

# A throwaway function exercising the shared contract version helper; it exists only for this run, never in prod.
probe_dir=supabase/functions/contract-probe
mkdir -p "$probe_dir"
cat >"$probe_dir/index.ts" <<'TS'
import { withContractVersion } from "../_shared/contract-version.ts";

Deno.serve(withContractVersion(() => Response.json({ ok: true })));
TS

log=$(mktemp)
pnpm exec supabase functions serve --no-verify-jwt >"$log" 2>&1 &
serve=$!
trap 'kill $serve 2>/dev/null || true; wait $serve 2>/dev/null || true; rm -f "$log"; rm -rf "$probe_dir"' EXIT

if ! api=$(pnpm exec supabase status --output json 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0)).API_URL'); then
	echo "The local stack isn't running; start it with \`pnpm stack:up\`." >&2
	exit 1
fi
url="$api/functions/v1/health"
for _ in $(seq 60); do
	# Only trust a response once `functions serve` owns the runtime, not the edge runtime `supabase start` runs.
	if grep -q "Serving functions on" "$log" && body=$(curl --silent --fail --max-time 2 "$url") && [[ $body == '{"ok":true}' ]]; then
		echo "health: $body"
		break
	fi
	sleep 1
done
if [[ ${body:-} != '{"ok":true}' ]]; then
	echo "Edge Functions did not serve $url within 60s" >&2
	cat "$log" >&2
	exit 1
fi

# The shared contract version helper (ADR-0009): no header and an old build get 426, a current build passes.
probe="$api/functions/v1/contract-probe"
status() { curl --silent --output /dev/null --write-out "%{http_code}" --max-time 10 "$probe" "$@"; }
current=$(sed -n 's/^export const CONTRACT_VERSION = \([0-9]*\);$/\1/p' packages/domain/src/contract-version.ts)
[[ -n $current ]] || { echo "Could not read CONTRACT_VERSION" >&2; exit 1; }
results="none:$(status) old:$(status -H "x-contract-version: 0") current:$(status -H "x-contract-version: $current")"
echo "contract-probe: $results"
[[ $results == "none:426 old:426 current:200" ]] || { cat "$log" >&2; exit 1; }

# accept-invite boots and answers through the domain handler: an unknown Invite is a 404, a sign-in-less accept a 401.
invite="$api/functions/v1/accept-invite"
ask() { curl --silent --output /dev/null --write-out "%{http_code}" --max-time 10 "$invite" -H "x-contract-version: $current" -H "content-type: application/json" --data "$1"; }
token=$(printf 'a%.0s' $(seq 32))
results="preview:$(ask "{\"action\":\"preview\",\"token\":\"$token\"}") accept:$(ask "{\"action\":\"accept\",\"token\":\"$token\"}")"
echo "accept-invite: $results"
[[ $results == "preview:404 accept:401" ]] || { cat "$log" >&2; exit 1; }
