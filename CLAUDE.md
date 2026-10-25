# Hisaab- Household Finance Management

## Monorepo Structure

During review, scrutinize aggressively and flag potential violations of this structure (particularly the code practices)

| Path | Holds |
|---|---|
| `apps/app` | The Expo universal app (Expo Router, NativeWind, Lingui). Screens, components, hooks, the upload connector. |
| `packages/domain` | Framework-free TS: Money, derived balances, Budget months, Occurrences, Base amounts, report math, upcasters, Edge Function logic behind injected adapters. |
| `packages/client-schema` | The hand-written PowerSync `Schema` + Drizzle tables (synced subset + local-only tables). Never generated from Postgres. |
| `supabase/` | CLI migrations (`supabase/migrations`), Edge Functions, pgTAP tests, `config.toml`. |
| `powersync/` | `sync-config.yaml` (Sync Streams) and the self-hosted service config for the local Docker stack. |
| `tests/sync` | The Node (`@powersync/node`) harness: RLS ⊇ Sync Streams differential and offline/conflict scenarios. |
| `tooling/` | Repo tooling with no package of its own: the custom ESLint rules (`tooling/eslint`) and their tests, the local stack scripts (`tooling/stack`). |
| `docs/` | Spec, research, `secrets.md`, `infra.md`, release smoke checklist. |

### Code practices

- `packages/domain` must not import `react-native`, Expo, React or any I/O. Every invariant there gets a fast-check property test.
- Money is an exact decimal: `numeric` in Postgres, text on the device, parsed via the `Money` type. Never a JS `number`, never SQL `SUM`/`AVG` on money on the device. Online reads select money columns as `col::text`.
- RLS is the authority. Every `public` table has RLS and policies; Sync Streams must stay a subset of what RLS allows.
- Every tenant-owned row carries `household_id`, children included. Ids are client-generated UUIDv7.
- Schema changes are expand/contract only (ADR-0009). Destructive DDL needs the `contract` label; a contract-version bump ships its upcaster in the same PR.
- A PostgREST UPDATE/DELETE returning 0 rows is a rejection, not a success.
- Local data goes through Drizzle watched queries; TanStack Query only for online-only calls.
- Use `CONTEXT.md` terms in code, UI copy and tests (Entry, not transaction; Wallet, not account).
- Tests: behaviour only, queried by role/label. No E2E, snapshot or visual tests (ADR-0010).

## MCP Servers

### Chrome Devtools MCP server

Use whenever you need to interact with the frontend apps directly, e.g. to debug a frontend app or to inspect the frontend app's state.

The devtools MCP server (`devtools-mcp`) is configured in `.mcp.json`.
Use `admin` for both username and password to login

## Skill Loading for Tanstack libraries (@tanstack/react-query, @tanstack/react-table, @tanstack/react-virtual, etc.)

Before editing files for a substantial task involving one of the tanstack libraries:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

## Dependency Management

Always use exact versions and pnpm catalogs — never write a version directly in `package.json`.

**Never** override pnpm's `minimumReleaseAge` setting.

## Current Development Focus

Information related to the current development focus can be found in `./current-development-focus.md`.

## Communication Style

Caveman skill (`/caveman` skill) always active.

## Agent skills

### Issue tracker

GitHub Issues (khanate-dev/hisaab) via `gh` CLI; external PRs are not a triage surface. See `.claude/docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `.claude/docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `.claude/docs/adr/` at repo root. See `.claude/docs/agents/domain.md`.
