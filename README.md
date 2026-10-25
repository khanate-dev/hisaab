# Hisaab

Household finance management: shared Wallets, Entries, Budgets, Loans and reports, offline-first across Android, iOS and the web.

The rebuild is specified in [`docs/spec.md`](docs/spec.md) and sequenced in [`docs/implementation-plan.md`](docs/implementation-plan.md). Domain terms are in [`CONTEXT.md`](CONTEXT.md); decisions are in [`.claude/docs/adr`](.claude/docs/adr).

## Stack

- Expo universal app (Expo Router, React Native, react-native-web)
- Supabase (Postgres + RLS, Auth, Storage, Edge Functions) with PowerSync Sync Streams
- Drizzle over the PowerSync client database
- pnpm workspace with catalogs; TypeScript, ESLint, Prettier, cspell, Vitest

## Getting started

- Node.js 24 and pnpm (version pinned in `package.json`)
- `pnpm install`
- `pnpm check` runs typecheck, lint, format check, spellcheck, the Vitest suites and the app's Jest component tests
- `pnpm --filter @hisaab/app web` runs the app in the browser against the local stack (copy `apps/app/.env.example` to `apps/app/.env.local` first)
- `pnpm --filter @hisaab/app android` builds and runs an Android dev build; on an emulator or USB device, `adb reverse tcp:55321 tcp:55321 && adb reverse tcp:55380 tcp:55380` lets it reach the local stack

## Local stack

Needs Docker. `pnpm stack:up` starts Supabase (Postgres, Auth, Storage, Edge Functions) through the CLI, then a self-hosted PowerSync Service loaded with `powersync/sync-config.yaml`. The first run generates a local-only ES256 signing key (`supabase/signing_keys.json`, gitignored), so access tokens are asymmetric as in prod and PowerSync verifies them through Supabase's JWKS. No prod secret is involved. `pnpm stack:down` stops everything.

| Service | URL |
|---|---|
| Supabase API | http://localhost:55321 |
| Postgres | postgresql://postgres:postgres@localhost:55322/postgres |
| Studio | http://localhost:55323 |
| Mailpit (OTP emails) | http://localhost:55324 |
| PowerSync | http://localhost:55380 |

The ports sit in the 553xx range so they don't clash with other Supabase projects on the default 543xx ports. Copy `apps/app/.env.example` to `apps/app/.env.local` to point the app at this stack. Against the running stack: `pnpm test:db` runs pgTAP, `pnpm test:sync` runs the sync harness and `pnpm test:functions` smoke-runs the Edge Functions with `supabase functions serve` (which takes over the stack's edge runtime; `pnpm stack:down && pnpm stack:up` restores it). CI (`.github/workflows/ci.yml`) runs all of these plus `pnpm check` on every PR and push to `main`.
