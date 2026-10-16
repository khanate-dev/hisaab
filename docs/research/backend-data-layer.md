# Backend & data-layer architecture

- **Date:** 2026-10-06
- **Ticket:** [khanate-dev/hisaab#7](https://github.com/khanate-dev/hisaab/issues/7)
- **Scope:** Which backend + sync engine to use for the Expo universal app ([ADR-0006](../../.claude/docs/adr/0006-expo-universal-platform.md)). Fixed requirements: the sync engine/client SDK is officially supported on Expo/RN **and** web, with **offline writes** that are queued and survive restarts; household-as-tenant isolation at one fail-closed chokepoint below app code ([ADR-0001](../../.claude/docs/adr/0001-household-is-the-tenant.md)); client UUIDv7 ids; exact money; derived balances ([ADR-0002](../../.claude/docs/adr/0002-derived-balances.md)); append-only Activity log; email + Apple auth; account deletion; attachments; server cron (rates, notifications, Full backup); push; solo dev, cheap, low maintenance. Also covers exchange-rate providers, conflict models and lost-write detection.
- **Versions checked (npm/GitHub, 2026-10-06):** `@powersync/react-native` `2.3.1`, `@powersync/web` `2.4.2`, PowerSync Service `v1.26.1` (GitHub release; `@powersync/service-core` `1.27.0` on npm), `@supabase/supabase-js` `2.117.2`, `@electric-sql/client` `1.5.28`, `@electric-sql/react` `1.0.57`, `@tanstack/db` `0.12.0`, `@tanstack/offline-transactions` `1.0.62`, `@tanstack/expo-db-sqlite-persistence` / `browser-db-sqlite-persistence` `0.2.29`, `@instantdb/react-native` `1.0.67`, `firebase` `12.19.0`, `@react-native-firebase/firestore` `26.4.0`, `convex` `1.46.0`, `better-auth` `1.7.7`, `hono` `4.13.13`, `jazz-tools` `0.20.19` (2.0 `alpha.59`), `@livestore/livestore` `0.4.0`, `tinybase` `10.0.1`, `@triplit/client` `1.0.50` (last publish 2025-07-31).

---

## TL;DR

**Recommendation: Supabase (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron) + PowerSync Cloud.** It is the only candidate that passes every hard requirement with officially supported, non-alpha core pieces:

- PowerSync has official RN/Expo (op-sqlite) and Web (wa-sqlite) SDKs, a durable local **upload queue** in SQLite, and a server-authoritative write path you control. It bypasses `expo-sqlite`'s alpha web support entirely.
- Postgres gives RLS as the write-side chokepoint, `numeric`/`bigint` for money, triggers for the Activity log, and a clean exit (plain Postgres; PowerSync Service is self-hostable under FSL-1.1-ALv2).
- **Cost:** $0 while building. For the public launch, budget **Supabase Pro $25/mo** (no pausing, daily backups, image transforms). PowerSync Free is usable until **50 peak concurrent clients**, then Pro is $49/mo.

**Caveats you accept with this pick:**

1. **PowerSync's React Native Web integration is labelled beta.** Its web SDK itself is stable. Prototype it early (spike ticket).
2. **Reads and writes have two rule sets:** Sync Streams decide what is downloaded; RLS guards what is uploaded. ADR-0001 says "one chokepoint". Either amend the ADR to "one chokepoint per direction" or derive both from one membership function and test that they agree.
3. **Built-in attachment helpers are alpha.** Plan to own that queue code if needed.
4. **Sync `numeric` arrives as text in SQLite.** Store money as **`bigint` minor units** so local `SUM()` is exact.

**Eliminated:**

- **InstantDB:** its team joined OpenAI. Cloud signups are closed and **all cloud apps shut down on 2027-08-31** ([announcement](https://www.instantdb.com/essays/instant_team_joins_openai)).
- **Convex:** no official offline writes. PowerSync-on-Convex is experimental.
- **Firebase:** works offline, but has no decimal type, no offline transactions, Blaze is required for Storage and scheduled functions, and lock-in is high.
- **Electric + TanStack DB:** offline writes are now possible, but the stack is pre-1.0 everywhere (DB `0.12`, persistence `0.2`), the RN outbox needs your own storage adapter, and you build the write API and auth proxy yourself.
- **Hand-rolled Neon + Workers:** the PowerSync replication slot keeps Neon compute awake 24/7, which blows the free 100 CU-hours. Workers Free has 10 ms CPU. The maintenance burden is highest.
- **Triplit, Jazz, LiveStore, TinyBase:** see §7.

---

## Comparison

| Criterion | Supabase + PowerSync | Supabase + Electric + TanStack DB | InstantDB | Firebase (Firestore) | Convex | Hand-rolled (Neon/Hono/Better Auth + PowerSync) |
|---|---|---|---|---|---|---|
| **Status** | GA. RNW integration **beta**. Attachments **alpha** | Electric 1.x GA. TanStack DB **0.12**, persistence **0.2.x** | **Cloud shutting down 2027-08-31** | GA | GA (no offline writes) | Pieces GA; you own the glue |
| **Offline writes, Expo + web (official)** | ✅ SQLite upload queue (op-sqlite native, wa-sqlite web) | ⚠ `@tanstack/offline-transactions` outbox: web IndexedDB; RN needs **your own** `StorageAdapter` | (n/a, disqualified) | ✅ RNFB native (persistent, default on); JS SDK web (`persistentLocalCache`). Two SDKs. JS SDK on RN is memory-only | ❌ Not official (PowerSync source is **experimental**) | ✅ (PowerSync) |
| **Isolation chokepoint** | Writes: Postgres **RLS**. Reads: **Sync Streams** (JWT `auth.user_id()` + subqueries) | Writes: your API/RLS. Reads: **your auth proxy** adding `where` to shapes | Rule language | **Security Rules**: one place for reads and writes ✅ | Function code | Writes: your API (+RLS optional). Reads: Sync Streams |
| **Conflict model** | Server-authoritative upload handler; default per-field LWW; rejections roll back locally | Server-authoritative (your API); optimistic state rolls back | — | LWW per field; **transactions fail offline** | Server mutations (online) | As PowerSync |
| **Exact money** | Postgres `bigint`/`numeric`. `numeric` syncs as **text**; `int8` as 64-bit integer ✅ | Postgres types; client JS | — | No decimal type; 64-bit int or float only → use integer minor units | Numbers (float64) / `v.int64()` | Postgres |
| **Auth** | Supabase Auth: email password, magic link/OTP, Apple (native `signInWithIdToken`), account deletion via admin API | Same | — | Firebase Auth, Apple, delete user | Convex Auth / Clerk etc. | Better Auth `1.7.7`: official Expo plugin, Apple idToken, `deleteUser` |
| **Storage / thumbnails** | Supabase Storage (1 GB free, 50 MB max file). **Image transforms Pro+ only** | Same | — | Cloud Storage: **Blaze required since 2026-02-03** | File storage (free tier) | R2/S3 or Neon object storage (5 GB free) |
| **Cron / jobs** | `pg_cron` + `pg_net` → Edge Functions (150 s wall-clock free, 256 MB, 2 s CPU) | Same | — | Scheduled functions: **Blaze**, $0.10/job/mo after 3 free | Crons ✅ (free) | Workers Cron (5 free, **10 ms CPU** free) |
| **Free tier gotchas** | Supabase pauses after **1 week inactivity**. PowerSync Free **deprovisions after 7 days with no deploys/connections**; 50 peak clients | Electric Cloud PAYG: bills under $5/mo waived | — | Spark lacks Functions/Storage | Generous | Neon: replication keeps compute on 24/7 |
| **Paid entry** | Supabase Pro $25 + PowerSync Pro $49 (when needed) | $25 + ~$0–5 Electric | — | Blaze pay-as-you-go | $25/dev/mo | VPS/Neon Launch ~$15+ |
| **Exit / self-host** | Postgres anywhere. PowerSync Open Edition (Docker, FSL-1.1-ALv2). Supabase self-hostable | Electric is Apache-2.0; TanStack is MIT | Self-host (Apache-2.0) | High lock-in | Open-source backend | Fully yours |
| **Solo-dev maintenance** | Low | Medium–high (assemble write path, outbox storage, auth proxy) | — | Low–medium | Low (but fails requirement) | **High** |

---

## Per-option findings

### 1. Supabase + PowerSync (recommended)

**PowerSync client SDKs**

- **React Native & Expo:** uses `@op-engineering/op-sqlite` (≥1.17.0), so it needs a dev build. For Expo Go there is a JS adapter `@powersync/adapter-sql-js` ([RN & Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo.md)).
- **React Native Web:** "currently in a **beta** release". It needs `@powersync/web` alongside the RN SDK, worker assets copied to `public/` (`npx @powersync/web copy-assets`), and platform-split DB setup ([RNW support](https://docs.powersync.com/client-sdks/frameworks/react-native-web-support.md)). Demo: `react-native-web-supabase-todolist`.
- **Web storage:**
  - The default VFS is `IDBBatchAtomicVFS` (IndexedDB, multi-tab).
  - **`OPFSCoopSyncVFS` is recommended for multi-tab on Safari/iOS.**
  - `AccessHandlePoolVFS` is single-tab.
  - The in-memory VFS is unsuitable for offline use ([Web SDK](https://docs.powersync.com/client-sdks/reference/javascript-web.md)).
- **Implication:** PowerSync brings its own SQLite on both platforms, so ADR-0006's `expo-sqlite`-web-alpha risk is avoided. I did not confirm whether COOP/COEP headers are needed for the OPFS VFSes.

**Write path, conflicts and errors**

- **The upload queue:**
  - Client mutations go to an ordered, local "upload queue" of PUT/PATCH/DELETE ops. Your `uploadData()` connector drains it against your backend.
  - Ops must be idempotent, and there is a per-client incrementing op id for dedup.
  - The default backend behaviour is per-field LWW with "deletes always win". Anything else is your server's custom logic ([update conflicts](https://docs.powersync.com/handling-writes/handling-update-conflicts.md)).
- **Error handling:**
  - Return **2xx even for validation failures**. Reserve errors for transient issues or bugs, because an error leaves the op stuck in the queue and blocks it.
  - Rejected changes are rolled back automatically: once the queue is empty, the client resets to the server state.
  - To surface a rejection, put it in the 2xx response body or write it to a table that syncs back. A server-side dead-letter queue is optional ([write errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors.md)).
- **With Supabase, the documented write path** is `supabase-js` against the Data API, so **RLS applies to every uploaded write**. Grants plus RLS are both required ([Supabase guide](https://docs.powersync.com/integrations/supabase/guide.md)).
- **Better for Hisaab:** have `uploadData()` call one Postgres RPC, e.g. `apply_ops(batch jsonb)`, declared `SECURITY INVOKER` so RLS still applies.
  - It applies the batch in one transaction and validates domain invariants (role, wallet archived, base currency locked).
  - It records rejections in a synced `sync_rejection` table.
  - A trigger writes the Activity log (before→after, device time, server time).

**Permissions (reads)**

- Sync Streams are now the primary model. Sync Rules are marked **legacy**, with a migration guide ([Sync Streams](https://docs.powersync.com/sync/streams/overview.md), [migrate](https://docs.powersync.com/sync/rules/migrate-to-sync-streams.md)).
- Streams filter by JWT claims (`auth.user_id()`, `auth.parameter()`) and support subqueries ([parameters](https://docs.powersync.com/sync/streams/parameters.md)). Shape: `SELECT * FROM entry WHERE household_id IN (SELECT household_id FROM membership WHERE user_id = auth.user_id())`.
- PowerSync says Sync Streams "do not apply to uploaded data" and that RLS "should be used as the authoritative set of security rules" for CRUD ([RLS and Sync Streams](https://docs.powersync.com/integrations/supabase/rls-and-sync-streams.md)).
- **This is a two-rule-set design**, which conflicts with ADR-0001's single chokepoint. Both sets fail closed: no stream match means no download, and no RLS policy means denied.
- Supabase's new JWT signing keys are picked up automatically through JWKS.

**Money and types**

- Postgres `numeric` → SQLite `text` ("can only be represented accurately as text"). `int8` → 64-bit `integer` ([types](https://docs.powersync.com/sync/types.md)).
- **Implication:** store amounts as `bigint` minor units plus the currency exponent. Local `SUM()` over integers is exact. A `SUM()` over a text column would coerce to float.
- Store exchange rates as `numeric` (text on the client) and do the arithmetic with a decimal library. Base amounts are frozen at write time ([ADR-0005](../../.claude/docs/adr/0005-frozen-base-amounts.md)), so rate math runs once per Entry.

**Attachments**

- The `@powersync/attachments` package is **deprecated**. Its replacement is built-in helpers, labelled **alpha**, in Web ≥1.33 / RN ≥1.30.
- Local storage: `IndexDBFileSystemStorageAdapter` on web, and `ExpoFileSystemStorageAdapter` on RN (**requires Expo 54+**).
- The queue runs QUEUED_UPLOAD → SYNCED → QUEUED_DOWNLOAD → ARCHIVED and retries. Files go to storage via signed URLs from your backend ([attachments](https://docs.powersync.com/client-sdks/advanced/attachments.md)).
- Lazy download and thumbnails are your job:
  - Generate a thumbnail client-side before upload and store it as a second object.
  - Supabase image transformations are **Pro+ only**: 100 origin images included, then $5 per 1,000 ([image transforms](https://supabase.com/docs/guides/storage/serving/image-transformations)).

**Supabase platform**

- **Free plan** ([pricing](https://supabase.com/pricing)):
  - 500 MB DB, 1 GB file storage, 50 MB max upload, 50k MAU, 5 GB egress, 500k Edge Function invocations.
  - 2 active projects, no backups, "paused after 1 week of inactivity".
- **Pro** $25/mo: 8 GB disk, 100 GB storage, 250 GB egress, 2M invocations, daily backups (7 days), never paused.
- **Edge Functions:**
  - 256 MB memory, 2 s CPU per request.
  - Wall-clock limit is 150 s on Free and 400 s on paid.
  - 100 functions on Free ([limits](https://supabase.com/docs/guides/functions/limits)).
  - Scheduling is `pg_cron` + `pg_net` calling the function ([schedule functions](https://supabase.com/docs/guides/functions/schedule-functions)).
- **Full backup ZIP:** 256 MB of memory and 150 s will not fit a large household's attachments if the ZIP is built in memory. Stream it into Storage in chunks, or run the builder elsewhere (e.g. a GitHub Actions job or a small container).
- **Sign in with Apple:**
  - Native: `expo-apple-authentication` → `signInWithIdToken`. No secret rotation is needed.
  - Web OAuth: "generate a new secret key every 6 months". Apple returns the user's name only on first sign-in ([Apple auth](https://supabase.com/docs/guides/auth/social-login/auth-apple)).
- **Account deletion:** an Edge Function with the service role calls `auth.admin.deleteUser`, plus the ADR-0001 cascade: delete the Personal household and anonymize authorship elsewhere.

**PowerSync Cloud pricing** ([pricing](https://www.powersync.com/pricing), [billing](https://docs.powersync.com/resources/usage-and-billing.md))

- **Free:**
  - 2 GB synced/month, 500 MB hosted, **50 peak concurrent clients**, 2 instances.
  - Free instances with "no deploys or client connections for over 7 days will be deprovisioned". Restarting reprocesses from scratch and re-syncs clients.
- **Pro** from $49/mo: 30 GB synced, 10 GB hosted, 1,000 peak clients, then $1/GB. There are no spending caps yet, but invoices over $100 are held for review.
- **Self-host (Open Edition):**
  - Docker image `journeyapps/powersync-service`. No dashboard ([self-hosting](https://docs.powersync.com/intro/self-hosting.md)).
  - License **FSL-1.1-ALv2** ([LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)).
  - Deployment guides exist for Railway and Coolify.

### 2. Supabase + ElectricSQL + TanStack DB

**Electric**

- Electric is **read-path only**. Writes go through your API. The writes guide gives four patterns: online, optimistic, shared persistent optimistic, and through-the-DB ([writes guide](https://electric.ax/docs/sync/guides/writes.md)).
- **Auth** is your **proxy or gatekeeper** in front of shape requests ([auth guide](https://electric.ax/docs/sync/guides/auth.md)). That proxy becomes the read chokepoint, and it is app code.
- **Expo support** is a short page showing `useShape` from `@electric-sql/react` (install "using `--force`") ([Expo integration](https://electric.ax/docs/sync/integrations/expo.md)). It does not cover persistence or an outbox.

**TanStack DB offline writes, now real**

- `@tanstack/offline-transactions` `1.0.62` provides a durable outbox with FIFO replay, retries, and leader election across tabs; non-leader tabs run online-only. Storage is IndexedDB with a localStorage fallback.
- On **React Native/Expo**, you "supply a `StorageAdapter`… the package does not include an AsyncStorage adapter" ([README](https://www.npmjs.com/package/@tanstack/offline-transactions)).
- Persisted collections (offline reads) come from `@tanstack/expo-db-sqlite-persistence` / `browser-db-sqlite-persistence` `0.2.29`.

**Pricing**

- Electric Cloud PAYG: $1 per 1M writes, $0.10/GB-month; reads and egress are free; "under $5/mo waived" ([pricing](https://electric.ax/pricing.md)).
- PAYG has no Postgres subqueries in shapes. Scope shapes by `household_id IN (…)`, with the allowed list computed by your proxy.

**Verdict:** this now *meets* the offline-write requirement, but every client piece is 0.x or needs custom adapters. You also write the write API, the idempotency handling and the auth proxy yourself. It has more moving parts than PowerSync and less maturity. Revisit when TanStack DB reaches 1.0.

### 3. InstantDB

**Disqualified on business continuity.**

- The team joined OpenAI. "New signups are closed. Existing users should migrate off of Instant Cloud within the next 12 months… On August 31st, 2027, all cloud apps will shut down" ([announcement](https://www.instantdb.com/essays/instant_team_joins_openai)).
- Self-hosting exists (Apache-2.0 repo, last push 2026-09-28; [self-hosting docs](https://instantdb.com/docs/self-hosting.md)). It needs Hazelcast/gRPC for multi-server setups.
- Not evaluated further.

### 4. Firebase

**Offline**

- React Native Firebase persists Firestore offline by default ([RNFB](https://rnfirebase.io/firestore/usage)), but it needs a dev build, and Expo's guide steers universal and Expo Go apps to the JS SDK ([Expo Firebase guide](https://docs.expo.dev/guides/using-firebase/)).
- The JS SDK on web supports `persistentLocalCache` + `persistentMultipleTabManager` ([offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).
- In practice this means **two SDKs** behind a seam.
- "Transactions will fail when the client is offline" ([transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)). So multi-document invariants (mirrored cross-household transfers, Item totals) can't be atomic offline. Batched writes still queue.

**Isolation** is Security Rules, one engine for both reads and writes. This is the cleanest fit for ADR-0001's single chokepoint.

**Money:** there is no decimal type, so use integer minor units. Reports have no SQL; aggregates are computed client-side or in Functions.

**Billing**

- Cloud Storage for Firebase **requires Blaze**. Spark projects lost access on 2026-02-03. A no-cost quota still applies on Blaze ([storage FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).
- Scheduled functions need Blaze: $0.10/job/month, 3 free per account ([schedule functions](https://firebase.google.com/docs/functions/schedule-functions)).

**Verdict:** workable, but proprietary. It is a poor fit for relational finance reporting, offline atomicity and exit.

### 5. Convex

- There is no official offline-write support.
- Community options: `convex-rn` ("EXPERIMENTAL (not for production)") and Replicate (Yjs CRDTs).
- PowerSync added Convex as a source in an **experimental** release on 2026-06-10 ([announcement](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental)). Convex's own Curvilinear local-sync repo is reported archived (2026-09-24, unverified).
- Pricing is generous: Free & Starter, 40 deployments, crons, file storage; Professional is $25/dev/mo ([pricing](https://www.convex.dev/pricing)).
- **Fails the hard requirement.**

### 6. Hand-rolled: Neon + Hono on Workers + Better Auth + PowerSync

**Better Auth** `1.7.7`: the official `@better-auth/expo` plugin keeps sessions in `expo-secure-store`, supports idToken sign-in for Apple, Google and Facebook, and works on web ([Expo integration](https://www.better-auth.com/docs/integrations/expo)). `deleteUser` is opt-in ([users](https://www.better-auth.com/docs/concepts/users-accounts)).

**Neon Free** ([pricing](https://neon.com/pricing)):

- 100 projects, **100 CU-hours/month per project**, 1 GB storage, 5 GB object storage. Neon now also bundles "Managed Better Auth" and Functions.
- **Blocker:** "While a logical replication subscriber is connected, your Neon compute stays active and will not scale to zero" ([Neon logical replication](https://neon.com/docs/guides/logical-replication-neon)).
- PowerSync is such a subscriber. At 0.25 CU × 730 h ≈ 182 CU-h, the free allowance is exceeded. My inference: expect about $15+/mo on Launch.

**Cloudflare Workers Free:** 100k requests/day, **10 ms CPU per request**, 5 cron triggers ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Password hashing and ZIP building will exceed 10 ms, so the paid Workers plan ($5/mo) is realistic.

**Maintenance:** you own the auth DB schema, the API, migrations, the RLS (or a hand-written chokepoint), storage signing, cron, email delivery and push fan-out. **Highest burden.** Its only advantage is zero platform lock-in, and Supabase + PowerSync already has a credible exit.

### 7. Others (one-liners)

- **Triplit:** last npm release 2025-07-31, last push 2026-01-19. Abandoned-looking, dismissed.
- **Jazz:** stable `0.20.x` while 2.0 is in **alpha** (`2.0.0-alpha.59`). Its CoValue/group model is not relational and has no Postgres. Dismissed for a finance ledger.
- **LiveStore:** `0.4.0` is pre-1.0 (`0.5.0-dev`), event-sourced, with an Expo adapter. The permission model is your sync backend. Dismissed on maturity.
- **TinyBase** `10.0.1`: has persisters for expo-sqlite and the web, plus a WS synchronizer, but no server-side auth or permission layer. You would build the chokepoint. Dismissed.
- **Zero:** already disqualified (it rejects offline writes).

---

## Conflict model (applies to the recommended stack)

| Data | Recommended model | Why |
|---|---|---|
| Entries, Items, Attachments (inserts) | Insert-only with client UUIDv7; idempotent upsert on `id` | No conflicts; retries are safe |
| Entry/Wallet/Category edits | **Server-authoritative per-field LWW** in `apply_ops`, keyed on server receive order; Activity log keeps before→after so nothing is silently lost | PowerSync default; matches "Activity log can restore" |
| Deletes | Soft-delete wins over concurrent edits (tombstone + restore from Activity log) | PowerSync recommends "deletes always win" |
| Balances | **Never written**: derived from Entries (ADR-0002) | Removes the classic counter conflict entirely |
| Invariants (Role ≥ Member, wallet not archived, base currency locked, Cross-household transfer pair) | Validated in `apply_ops` transaction; on failure → 2xx + row in synced `sync_rejection` → client shows "change not saved" with the payload to retry | PowerSync rolls back rejected writes automatically |
| Occurrences of Recurring rules | Deterministic id (rule + due date, ADR-0004) → duplicate confirmations from two devices collapse | Idempotent by construction |

CRDTs are not needed. Firebase's model would be client-applied LWW with Security Rules validation, and it has no offline transactions. Electric with TanStack DB would be server-authoritative through your API, the same in spirit as PowerSync.

## Detecting and recovering lost unsynced writes

Context: the web DB can be evicted (see the [platform research](./mobile-platform-shape.md)). PowerSync's queue (`ps_crud`) lives in the same SQLite file, so eviction loses both the data and the queue. The server cannot know about writes it never received. Detection therefore has to be indirect:

1. **Prevent:**
   - Call `navigator.storage.persist()` on web.
   - Upload eagerly on every write.
   - On web, block sign-out and warn on `beforeunload` while the queue is non-empty. PowerSync exposes upload-queue stats and status.
2. **Device heartbeat:**
   - Each install registers a `device` row with a random `install_id`, stored in the local DB.
   - The client periodically reports `pending_ops` and the last local op id.
   - If a user later appears on the same browser or device with a new `install_id` while the old device's last heartbeat showed `pending_ops > 0`, show "N changes made on this device on <date> may not have synced".
   - My design suggestion, not a PowerSync feature.
3. **Visible state:** a persistent "X unsynced changes" badge, and a "last synced at" time in Settings.
4. **Native:** op-sqlite files in the app sandbox are durable, so this risk is mainly on web.

---

## Exchange-rate providers (historical daily, PKR)

| Provider | Free tier | Historical daily | PKR | Notes |
|---|---|---|---|---|
| **fawazahmed0/exchange-api** | No key, "No Rate limits", CC0 | ✅ `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{YYYY-MM-DD}/v1/currencies/usd.json` | ✅ Verified: 2025-01-15 USD→PKR `278.755` (primary and the `{date}.currency-api.pages.dev` fallback agree) | Volunteer project, no SLA; the docs require a fallback ([repo](https://github.com/fawazahmed0/exchange-api)) |
| **Open Exchange Rates** | 1,000 req/month, USD base only, hourly | ✅ `/historical/YYYY-MM-DD.json` back to 1999-01-01; only `base`/`symbols` are plan-gated | ✅ Listed | Developer plan $12/mo ([plans](https://openexchangerates.org/signup), [historical](https://docs.openexchangerates.org/reference/historical-json)) |
| **currencyapi.com** | 300 req/month, 10/min, daily updates, **"Private Use"** | ✅ Listed on the free plan | Not verified | Commercial use needs Small, $9.99/mo ([pricing](https://currencyapi.com/pricing/)) |
| ~~ExchangeRate-API~~ | — | Paid plans only ([docs](https://www.exchangerate-api.com/docs/historical-data-requests)) | — | Excluded |
| ~~Frankfurter (ECB)~~ | Free | ✅ | ❌ No PKR (verified via `/v1/currencies`) | Excluded |

**Suggestion:** a daily `pg_cron` job fetches Open Exchange Rates `latest.json` (1 call/day, about 30/month) into a `rate(date, base, quote, rate numeric)` table, falling back to fawazahmed0. Backfills use `historical/`.

---

## Push

- Mobile: Expo push service (free) over APNs/FCM. Store Expo push tokens per device and send from Edge Functions.
- Web: `expo-notifications` has no web push, so web needs VAPID Web Push separately. I did not confirm whether the `web-push` npm library runs on Supabase's Deno Edge runtime.
- The Notification inbox is just a synced table; push is a delivery channel on top.

---

## Open questions for the decision

1. **ADR-0001 wording:** accept "one chokepoint per direction" (Sync Streams for reads, RLS for writes), or require one engine for both? Only Firebase Security Rules give a single engine among the viable options.
2. **Money storage:** `bigint` minor units (recommended for exact offline sums) or `numeric` stored as text with a decimal library in every aggregate?
3. **Write path:** direct `supabase-js` table writes under RLS (PowerSync's documented path) or a single `apply_ops` RPC (atomic batches, central validation and Activity log)?
4. **Launch budget:** is Supabase Pro at $25/mo acceptable from public launch (no pausing, backups)? Is PowerSync Pro at $49/mo acceptable once peak concurrent clients near 50?
5. **Full backup builder:** an Edge Function with streaming or chunking, or an external job runner?
6. **Spike first:** PowerSync on Expo SDK 57/58 with react-native-web (beta) + OPFSCoopSyncVFS on iOS Safari + the built-in attachments queue (alpha).

---

## Sources

- PowerSync: [Pricing](https://www.powersync.com/pricing) · [Usage & billing](https://docs.powersync.com/resources/usage-and-billing.md) · [RN & Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo.md) · [RNW support](https://docs.powersync.com/client-sdks/frameworks/react-native-web-support.md) · [Web SDK](https://docs.powersync.com/client-sdks/reference/javascript-web.md) · [Update conflicts](https://docs.powersync.com/handling-writes/handling-update-conflicts.md) · [Write errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors.md) · [Sync Streams](https://docs.powersync.com/sync/streams/overview.md) · [Parameters](https://docs.powersync.com/sync/streams/parameters.md) · [RLS and Sync Streams](https://docs.powersync.com/integrations/supabase/rls-and-sync-streams.md) · [Supabase guide](https://docs.powersync.com/integrations/supabase/guide.md) · [Types](https://docs.powersync.com/sync/types.md) · [Attachments](https://docs.powersync.com/client-sdks/advanced/attachments.md) · [Self-hosting](https://docs.powersync.com/intro/self-hosting.md) · [Service LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE) · [Convex source (experimental)](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental)
- Supabase: [Pricing](https://supabase.com/pricing) · [Edge Function limits](https://supabase.com/docs/guides/functions/limits) · [Scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions) · [Image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) · [Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple) · [Paused projects restorable 90 days (changelog)](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days)
- Electric / TanStack: [Writes](https://electric.ax/docs/sync/guides/writes.md) · [Auth](https://electric.ax/docs/sync/guides/auth.md) · [Expo](https://electric.ax/docs/sync/integrations/expo.md) · [Pricing](https://electric.ax/pricing.md) · [@tanstack/offline-transactions](https://www.npmjs.com/package/@tanstack/offline-transactions)
- InstantDB: [Team joins OpenAI](https://www.instantdb.com/essays/instant_team_joins_openai) · [Self-hosting](https://instantdb.com/docs/self-hosting.md)
- Firebase / Expo: [Storage Blaze FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) · [Offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline) · [Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) · [Scheduled functions](https://firebase.google.com/docs/functions/schedule-functions) · [RNFB Firestore](https://rnfirebase.io/firestore/usage) · [Expo Firebase guide](https://docs.expo.dev/guides/using-firebase/)
- Convex: [Pricing](https://www.convex.dev/pricing)
- Hand-rolled: [Better Auth Expo](https://www.better-auth.com/docs/integrations/expo) · [Better Auth users](https://www.better-auth.com/docs/concepts/users-accounts) · [Neon pricing](https://neon.com/pricing) · [Neon logical replication](https://neon.com/docs/guides/logical-replication-neon) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Rates: [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) · [OXR plans](https://openexchangerates.org/signup) · [OXR historical](https://docs.openexchangerates.org/reference/historical-json) · [currencyapi pricing](https://currencyapi.com/pricing/) · [ExchangeRate-API historical](https://www.exchangerate-api.com/docs/historical-data-requests)

### Unconfirmed / flagged

- **Supabase paused-project restore window:** the [changelog](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days) says 90 days. A search summary claims it changed to 1 year on 2026-09-22, but I found no primary source. I also did not confirm whether PowerSync's replication connection counts as "activity" against pausing.
- **WebFetch could not resolve some domains** (powersync.com, electric-sql.com, neon.com, currencyapi.com), so those pages were fetched with `curl` and stripped of HTML. Prices were read from page text, not from rendered tables.
- **Open Exchange Rates free plan and `historical/`:** the docs gate only `base`/`symbols`, but the signup page did not list historical access for Free. Confirm with a free key. Also check OXR's free-plan licence terms for commercial apps.
- **currencyapi.com PKR coverage:** not verified.
- **InstantDB offline-write internals:** not checked once it was disqualified.
- **RNFB web:** I did not check whether React Native Firebase now offers an official web fallback.
- **Convex Curvilinear archival:** comes from a search summary only.
- **Supabase direct deletion from `storage.objects` via SQL:** I believe this is disallowed (use the Storage API from the purge job), but did not re-verify.
- **Sign in with Apple token revocation on account deletion:** Apple guidance, not checked against Supabase's support for it.
- **COOP/COEP:** whether PowerSync's OPFS VFSes need these headers was not verified.
- **Web Push on Deno Edge Functions:** not verified.
