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

# dispatch-notifications runs only for the service role (pg_cron calls it with that key): a bogus key, the anon key
# and a signed-in User's are refused by the database, the service role's is let through.
dispatch="$api/functions/v1/dispatch-notifications"
keys=$(pnpm exec supabase status --output json 2>/dev/null)
service_key=$(node -p 'JSON.parse(process.argv[1]).SERVICE_ROLE_KEY' "$keys")
anon_key=$(node -p 'JSON.parse(process.argv[1]).ANON_KEY' "$keys")
run() { curl --silent --output /dev/null --write-out "%{http_code}" --max-time 20 -X POST "$dispatch" "$@"; }
results="bogus:$(run -H "authorization: Bearer nope") anon:$(run -H "authorization: Bearer $anon_key") service:$(run -H "authorization: Bearer $service_key")"
echo "dispatch-notifications: $results"
[[ $results == "bogus:403 anon:403 service:200" ]] || { cat "$log" >&2; exit 1; }

# purge-attachments likewise runs only for the service role, through the database and the Storage API.
purge="$api/functions/v1/purge-attachments"
results="bogus:$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$purge" -H "authorization: Bearer nope") anon:$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$purge" -H "authorization: Bearer $anon_key") service:$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$purge" -H "authorization: Bearer $service_key")"
echo "purge-attachments: $results"
[[ $results == "bogus:403 anon:403 service:200" ]] || { cat "$log" >&2; exit 1; }

# A key that looks like a secret one but isn't is refused by the database itself, for each service-only function.
for fn in dispatch-notifications purge-attachments raise-notifications; do
	code=$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$api/functions/v1/$fn" -H "authorization: Bearer sb_secret_wrong")
	echo "$fn wrong secret: $code"
	[[ $code == 403 ]] || { cat "$log" >&2; exit 1; }
done

# raise-notifications likewise, raising each household's 09:00 Notifications through the database.
raise="$api/functions/v1/raise-notifications"
results="anon:$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$raise" -H "authorization: Bearer $anon_key") service:$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 -X POST "$raise" -H "authorization: Bearer $service_key")"
echo "raise-notifications: $results"
[[ $results == "anon:403 service:200" ]] || { cat "$log" >&2; exit 1; }
