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
- `pnpm check` runs typecheck, lint, format check, spellcheck and tests
- `pnpm --filter @hisaab/app start` starts the Expo dev server
