# Schema evolution: expand/contract, a contract version, a hard block and client upcasters

Old app versions linger. Store review lags behind releases, some devices miss OTA updates, and some come back after weeks offline with writes still queued. So a schema change must not break clients that are still installed.

**Expand/contract only.** An expand release only adds: new tables, nullable or defaulted columns, and widened constraints. Nothing is renamed or retyped in place. A rename is done as add, backfill, then a dual-write trigger. A contract (a dropped column or table, or a tightened constraint) ships in its own migration, and only once the minimum supported version no longer references it. The upload handler sends only the columns its own version knows, so an old client never wipes a newer column. A new column must therefore still make sense when old clients leave it untouched.

**The gate is a manual integer contract version.** It lives in the JS bundle and is bumped only for contract changes, not for every release. Semver or EAS update ids would gate on every release, schema change or not. The server keeps `app_config.min_contract_version`, and raising it is itself a migration. It is raised only once the build that's needed is actually available: the OTA update is published, or the store build is approved and fully rolled out on both stores. The update comes OTA when the needed JS fits the installed `runtimeVersion`, from the store when it doesn't, and as a reload on web.

**Enforcement:**

- Every supabase-js request sends `x-contract-version`. A PostgREST `db_pre_request` function rejects a missing or too-old header with HTTP 426, and Edge Functions run the same check through a shared helper.
- `app_config` reaches every user through a global Sync Stream, so a returning device learns it is too old while downloading.
- Downloads are not gated.
- A 426 pauses the upload queue. It is never treated as a "couldn't sync" rejection.

**Hard block, with no read-only mode.** A client that is too old shows only "Update required". Its queue is kept. A device that's offline only finds out once it reconnects, and since it's online by then, it can fetch the update.

**Old-shape writes are upcast on the client.** Each queued op is stamped with the contract version it was written under, using PowerSync's per-op metadata. Before uploading, the handler chains pure upcaster functions over the op (for example 3→4→5). Each contract bump ships its upcaster in the same PR, which CI enforces. Upcasters are kept forever, with no floor. An op that can't be mapped meaningfully goes to "couldn't sync" and is never dropped silently. We rejected making the server accept old shapes through version-aware RPCs, because that would keep the compatibility logic in SQL forever, where it is harder to test.

**Tooling and order:**

- The repo holds three sources of truth: Supabase CLI migrations in `supabase/migrations`, the Sync Streams config in `powersync/sync-config.yaml` (deployed with the PowerSync CLI), and a hand-written TS client schema (the PowerSync `Schema` plus Drizzle). The client schema isn't generated from Postgres, because synced tables are a deliberate subset and some are local-only.
- CI checks for drift:
  - Every client-schema column exists in Postgres.
  - The Sync Streams reference only columns that exist.
  - Every contract bump has an upcaster.
  - RLS ⊇ Sync Streams.
- Rollout order:
  - **Expand:** DB migration, then the Sync Streams deploy, then the client release.
  - **Contract:** a client release that bumps the contract version and adds its upcaster, then the migration that raises `min_contract_version`, then a later release with the dropping migration and the Sync Streams update.

Decided in [Schema migration & versioning](https://github.com/khanate-dev/hisaab/issues/15).
