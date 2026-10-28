#!/usr/bin/env bash
# Type-checks each Edge Function with Deno, from its own directory so its own deno.json (if any) applies. The edge
# runtime runs them without checking, so this is where a type error shows before prod.
set -euo pipefail
cd "$(dirname "$0")/../../supabase/functions"

for dir in */; do
	[[ -f "$dir/index.ts" ]] || continue
	echo "deno check ${dir}index.ts"
	(cd "$dir" && deno check index.ts)
done
