# Hisaab rebuild: handoff spec

This is the end point of the [Wayfinder map: Hisaab rebuild spec](https://github.com/khanate-dev/hisaab/issues/1). It brings together every decision made on that map into one document for the implementation effort.

**How to read it.** This document is a summary and an index. The detailed rulings live in three places, and each section below links to them:

- **Decision tickets:** closed child issues of the map. Each one's resolution comment is the spec for its area.
- **ADRs:** `.claude/docs/adr/0001`–`0011`, for the decisions that are hard to reverse.
- **Glossary:** [`CONTEXT.md`](../CONTEXT.md), the ubiquitous language. Use its terms in code, UI copy and tests (Entry, not "transaction"; Wallet, not "account").

If this document and a source disagree, the source wins. If two sources disagree, the later ticket wins; the known cases are listed under [Superseded details](#superseded-details).

---

## 1. Product and scope

Hisaab (Urdu/Hindi for "account" or "reckoning") is household finance tracking: people record and budget money together within the households they belong to.

- **Green-field.** There is no production data and there are no users to migrate. The old Remix + Mantine + WatermelonDB + Turso/Deno stack is discarded; only its product understanding carries over.
- **The full long-term feature set,** not an MVP cut.
- **Mobile and web,** with offline as a real requirement on both.
- **Private use now** (the owner plus invited people), but open sign-up from day one. The architecture stays open to public multi-tenant SaaS later.
- **Cheap, low-maintenance hosting:** free tiers until a hard limit bites.
- **Public App Store and Play listings from day 1.**

Out of scope: see [§8](#8-out-of-scope).

## 2. Domain model

The terms are defined in [`CONTEXT.md`](../CONTEXT.md). The load-bearing rules:

| Rule | Source |
|---|---|
| The **Household** is the tenant. Every User gets an automatic **Personal household**; all financial data belongs to exactly one Household. Ids are client-generated UUIDv7. `household_id` is on every tenant-owned row, children included. | [ADR-0001](../.claude/docs/adr/0001-household-is-the-tenant.md), [Multi-tenancy scope](https://github.com/khanate-dev/hisaab/issues/4) |
| **Balances are derived:** opening Balance adjustment + every Entry. Nothing stored is the truth. | [ADR-0002](../.claude/docs/adr/0002-derived-balances.md) |
| A **Cross-household transfer** is two linked, mirrored Entries, one per household; each household sees only its own half. | [ADR-0003](../.claude/docs/adr/0003-mirrored-cross-household-transfers.md) |
| **Recurring rules** default to **Confirm**. An **Occurrence**'s id is deterministic (rule + due date), so offline devices don't create duplicates. | [ADR-0004](../.claude/docs/adr/0004-recurring-rules-confirm-and-deterministic-occurrences.md) |
| Each Entry in a non-base Wallet stores a **frozen, editable Base amount** priced at its own date's market rate. The Base currency locks once the household has any Entry. | [ADR-0005](../.claude/docs/adr/0005-frozen-base-amounts.md) |
| **Money is an exact decimal** in the actual unit (not minor units, never floats), with an ISO 4217 currency per Wallet. | [Core money model](https://github.com/khanate-dev/hisaab/issues/5), [ADR-0007](../.claude/docs/adr/0007-supabase-powersync-backend.md) |
| **Roles** are Admin / Member / Viewer, per household only. There's no platform super-admin and no per-wallet permission. | [Core money model](https://github.com/khanate-dev/hisaab/issues/5) |

## 3. Functional requirements

### 3.1 Households, people and access — [Multi-tenancy scope](https://github.com/khanate-dev/hisaab/issues/4), [Account deletion semantics](https://github.com/khanate-dev/hisaab/issues/12)
- Open self-service sign-up. Joining a household is only through **Invites**: expiring, revocable links with a preset Role, optionally tied to one email.
- No mutable data is shared across households. Categories are per household, copied from a built-in template.
- The last Admin can't leave. Deleting a household is Admin-only and hard-deletes everything, the Activity log included.
- **Account deletion** is immediate and server-side, with no grace period.
  - It needs a connection, a fresh OTP and a typed confirmation, and it first offers a Full backup of the Personal household.
  - Being the sole Admin of a populated shared household blocks it.
  - In shared households, the user becomes a per-household anonymous **Former member**.
  - Their private data is deleted and their Invites are revoked.
  - Nightly backups expire within 30 days, and a deletion ledger is re-applied after any restore.

### 3.2 Money: Wallets, Transfers, Loans — [Core money model](https://github.com/khanate-dev/hisaab/issues/5)
- **Wallet types:** Cash, Bank, Mobile wallet, Credit card (a liability). Any Wallet may go negative; the app warns but never blocks. Wallets are archived, never deleted, while Entries reference them.
- **Loans** are Lent or Borrowed, with a household **Contact** and an optional due date. The principal and each **Repayment** are Entries, and the outstanding amount is derived. A Loan settles at zero or by write-off. No interest is modelled.
- **Balance adjustment** reconciles a Wallet with reality and is excluded from budgets and reports.
- **The Activity log** is per household and append-only: who, device time, sync time, before → after. All members can see it, nobody can edit it, and deleted Entries can be restored from it.
- **Defaults:** the last-used household is remembered per device; each member has a default Wallet per household; a new Personal household starts with one Cash wallet.

### 3.3 Income, expenses, budgets, recurring — [Income & expense tracking](https://github.com/khanate-dev/hisaab/issues/6)
- **Categories:** separate Expense and Income lists, one level of Subcategories, an icon key and a colour. No tags.
- **Items** (Expenses only): once an Expense has Items, its total is their sum. Each Item may have its own Category, and budgets and reports count it there.
- **Budgets:** a standing amount per Budget month with per-month overrides, and no rollover. **Expected income** uses the same mechanism. The household picks the Budget month start day.
- **Recurring rules:** monthly on day N, weekly, every N months, or yearly, with an optional end. Auto-record or Confirm. Rule edits affect future Occurrences only.
- **Entry fields:** a date in the household timezone (time optional), a description with history autocomplete that pre-fills category, wallet and amount, recorded-by (automatic) and notes. There is no Payee and no Paid-by.

### 3.4 Multi-currency, Attachments, export/import, search — [Supporting features](https://github.com/khanate-dev/hisaab/issues/10)
- **Rates:** market rates only, fetched daily on the server and cached on devices. An offline device with no rate for the date uses the latest cached one, marks the Entry "rate estimated", and corrects it on sync unless the user edited it. A cross-currency Transfer stores both real amounts.
- **My overview** is shown in a per-user display currency, labelled "approx." when currencies mix.
- **Attachments:**
  - Up to 5 images or PDFs per Entry. Images are shrunk to about 2000px; PDFs are capped at about 10 MB. No OCR.
  - Metadata and thumbnails sync to every device; full files download lazily and stay cached.
  - Files of deleted Entries are purged after 90 days.
- **Admin-only data tools:**
  - **Spreadsheet export:** a CSV of Entries.
  - **Full backup:** a ZIP of JSON plus the Attachment files, restorable into a new household.
  - **CSV import** into one Wallet: column mapping saved per Wallet, likely duplicates flagged.
- **Search** runs on the device, one household at a time: free text, amounts (`2500`, `>2000`) and the full filter set. **Saved filters** are private to each user.

### 3.5 Reports and notifications — [Reports, analytics & notifications](https://github.com/khanate-dev/hisaab/issues/9), [Notification delivery channels](https://github.com/khanate-dev/hisaab/issues/13)
- **Six reports:** Spending by category, Budget vs actual (with **Pace**), Income vs expense, Category trend, Net worth, Loans summary.
  - All have a by-member filter, Budget-month range presets, and comparisons vs the previous period and vs the 3-month average.
  - Every number drills down to its Entries.
  - Reports exclude Balance adjustments and Pending Occurrences.
- **My overview** is computed on the device across all of a user's households. Cross-household pairs cancel out.
- **Seven notification triggers:** Recurring due, Auto-recorded, Budget threshold (80% and 100%), Loan due, Household activity digest, Membership, Monthly summary.
  - Preferences are per user × household × trigger.
  - The in-app **Notification inbox** always receives everything.
- **Delivery channels:**
  - Expo Push for mobile and VAPID Web Push for web. Push text never contains amounts.
  - Email via Resend, used only for the opt-in Monthly summary. Resend also sends the OTP and Invite emails.
  - An outbox (`notifications` + `notification_deliveries`) is drained every minute by a pg_cron Edge Function.
  - Scheduled sends go at 09:00 household time; the digest at 20:00.
  - The inbox is purged after 90 days.

## 4. UX

### 4.1 Look and theme — [Look & theme direction](https://github.com/khanate-dev/hisaab/issues/3)
**Neobrutal Pop**:
- Thick ink borders and hard offset shadows (no blur).
- Flat magenta, lime, butter and cyan tiles on cream; the logo's `#D24CFF` and `#200D26` anchor the palette.
- Archivo Black for headings and figures, Space Grotesk for body and UI, with tabular figures for amounts.
- Press-in states: a tapped control moves by the shadow offset and loses its shadow.
- Dark mode is an equal partner. It follows the OS, with a per-device override.
- Lucide icons (stroke 2.5), never emoji.

The full token table is in that ticket's resolution.

### 4.2 Navigation and screens — [Navigation, screen inventory & core UX flows](https://github.com/khanate-dev/hisaab/issues/17)
- **Phone tabs:** Home · Entries · **＋** · Budgets · Reports.
- **Top bar:** the avatar opens Me & household, the **household pill** opens the switcher sheet, and the bell opens the inbox.
- **My overview** is reached from the switcher's "All households" row and from a Reports tile.
- **Web uses two layouts:** below 1024px, the phone layout with content capped at about 640px; from 1024px up, a sidebar, and quick-add as a dialog.
- **Quick-add** opens on an in-app keypad, with Recent chips that pre-fill an Entry from history (3 taps for a repeat Entry).
- The **full screen inventory**, placed in this navigation, is in that ticket's resolution. It includes a Loans tile on Home that appears only while a Loan is outstanding.

### 4.3 Core flows — [Core flows: itemized Expense, recurring confirm, transfers, onboarding](https://github.com/khanate-dev/hisaab/issues/19)
- **Itemized Expense:** total first. The typed amount is the receipt total, and the user adds only the Items they want to split out. A dashed Rest becomes an "Other <category>" Item on save. No reordering.
- **Recurring confirm:** a Pending list with batch confirm for fixed amounts; variable bills ask for the amount first. Skip and Snooze apply to the whole household.
- **Transfer:** one "To" picker grouped by household. Picking a wallet in another household makes it a Cross-household transfer. A different currency adds an editable Received amount.
- **Onboarding:**
  - Fresh sign-up: Email → OTP → name → First Wallet (the opening balance for Cash; the currency picks the Personal Base currency).
  - Arriving by Invite: landing → OTP → name → Join.
  - App lock and push permission are asked later, in context.

## 5. Technical architecture

| Area | Decision | Source |
|---|---|---|
| Platform | **Expo universal**: Expo Router, React Native on device, react-native-web in the browser. Web has full parity, offline included. EAS cloud builds and OTA (no Mac). An optional per-device biometric lock (off by default; none on web in v1). | [Platform pick](https://github.com/khanate-dev/hisaab/issues/11), [ADR-0006](../.claude/docs/adr/0006-expo-universal-platform.md), [research](research/mobile-platform-shape.md) |
| UI stack | NativeWind + owned react-native-reusables on `@rn-primitives`; Lucide with a curated icon-key registry for Categories; gifted-charts behind `<BarChart>`/`<DonutChart>` wrappers; TanStack Form + Zod; Zustand; Lingui with logical properties, so the app is i18n-ready (English at launch). | [Frontend](https://github.com/khanate-dev/hisaab/issues/8), [ADR-0008](../.claude/docs/adr/0008-frontend-ui-stack.md) |
| Local data | Drizzle (pinned < 1.0) via the PowerSync driver, with reactive watched queries. TanStack Query only for online-only calls (Edge Functions, rates, signed URLs, account deletion). | [Frontend](https://github.com/khanate-dev/hisaab/issues/8), [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Backend | **Supabase** (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron) + **PowerSync Cloud** (Sync Streams), on free tiers. A nightly off-site backup (DB dump + Attachment files) to Cloudflare R2, kept 30 days. A daily keep-alive for **both** Supabase and PowerSync. | [Backend](https://github.com/khanate-dev/hisaab/issues/7), [ADR-0007](../.claude/docs/adr/0007-supabase-powersync-backend.md), [research](research/backend-data-layer.md) |
| Auth | **Email OTP only** (Supabase Auth via Resend SMTP). Asymmetric ES256 JWT keys, verified by PowerSync through JWKS. Adding social login later must include Sign in with Apple. | [Backend](https://github.com/khanate-dev/hisaab/issues/7), [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Sync and conflicts | Last writer wins **per row**, in server-arrival order. RLS is the authority and Sync Streams must be a subset of it. Rejected writes surface as "couldn't sync" items. Native sync uses **WebSocket**; web uses HTTP. | [Backend](https://github.com/khanate-dev/hisaab/issues/7), [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Money handling | `numeric` in Postgres, text on the device, parsed into a decimal type and never into floats. No SQL `SUM`/`AVG` on money on the device; use a typed `Money` accessor with a lint guard. Online reads select `col::text`. UPDATE/DELETE that RLS rejects returns 0 rows, which must be treated as a rejection. | [Backend](https://github.com/khanate-dev/hisaab/issues/7), [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Exchange rates | Open Exchange Rates, free plan: USD base only, cross rates computed on the server, each date fetched once into `exchange_rates`, historical endpoint verified, 1,000 requests a month. | [Backend](https://github.com/khanate-dev/hisaab/issues/7), [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Full backup | Built and restored on the Admin's device. No server job. | [Backend](https://github.com/khanate-dev/hisaab/issues/7) |
| Web hosting | A static Expo export on **Cloudflare Workers static assets** (`wrangler deploy --assets dist`). COOP/COEP isn't needed. The app requests persistent storage and warns about unsynced changes. | [Spike](https://github.com/khanate-dev/hisaab/issues/14) |
| Schema evolution | Strict expand/contract, gated by a manual integer **contract version** in the JS bundle against `app_config.min_contract_version`. Too-old clients get HTTP 426 and a hard "Update required" block, with the queue kept. Queued ops are stamped with their version and upcast on the client. A fixed rollout order applies. | [Schema migration](https://github.com/khanate-dev/hisaab/issues/15), [ADR-0009](../.claude/docs/adr/0009-schema-evolution-contract-version.md) |

The spike's tested version set is listed in [the Spike ticket](https://github.com/khanate-dev/hisaab/issues/14). Per `CLAUDE.md`, versions are pinned exactly through pnpm catalogs.

## 6. Quality and delivery

### 6.1 Testing — [Testing & QA strategy](https://github.com/khanate-dev/hisaab/issues/16), [ADR-0010](../.claude/docs/adr/0010-testing-strategy-no-e2e.md)
- **No E2E,** no snapshot tests and no visual tests.
- **Vitest + fast-check** cover the RN-free domain core, with a property test per invariant. **jest-expo/universal** with Testing Library covers component behaviour.
- **pgTAP** runs the RLS policy matrix. A **Docker Supabase + self-hosted PowerSync** harness runs the RLS ⊇ Sync Streams differential and 9 offline/conflict scenarios.
- **Gates:**
  - Every PR runs everything.
  - Nightly, fast-check runs a big fuzz.
  - Each release needs a manual device smoke checklist.

### 6.2 CI/CD, environments, secrets — [CI/CD pipeline](https://github.com/khanate-dev/hisaab/issues/18), [ADR-0011](../.claude/docs/adr/0011-cicd-split-cadence-prod-only.md)
- **Prod only,** plus a local Docker stack. All configuration is code.
- **Merge to `main`:** a `pg_dump` snapshot, then DB, then Sync Streams, then the web deploy.
- **Native releases** are a manual `release` workflow. A fingerprint check decides OTA vs store build, and updates go `preview` → smoke → republish to `production`.
- **Contract migrations** need a `contract` label and the `prod-contract` approval.
- **Secrets:** the GitHub `prod` Environment is the source.
- **Domains:** web at `hisaab.khanate.pk` (with `/privacy` and `/support`); Resend sends from `mail.hisaab.khanate.pk`; `support@` uses Cloudflare Email Routing.

## 7. Store compliance and launch checklist
From [Platform pick](https://github.com/khanate-dev/hisaab/issues/11), as amended by [Navigation, screen inventory & core UX flows](https://github.com/khanate-dev/hisaab/issues/17):
- [ ] Privacy policy (`/privacy`) and support URL (`/support`). The policy discloses the 30-day backup retention.
- [ ] App Store privacy labels and the Play Data safety form
- [ ] In-app account deletion (§3.1)
- [ ] Play's closed test: 12 testers × 14 days
- Sign in with Apple is **not required**, because sign-in is email OTP only.

## 8. Out of scope
- Public-SaaS launch mechanics: billing, ToS, marketing site, abuse and rate-limit hardening.
- The Urdu/RTL font pairing, since launch is English-only. It returns as its own effort when Urdu is planned.
- **Excluded features** (see each ticket's "Not included"):
  - forecasting and custom report builders
  - receipt OCR
  - household-set exchange rates
  - scheduled backups as a user feature
  - bank-specific importers
  - cross-household search
  - shared Saved filters
  - tags and payees
  - interest on Loans
  - low-balance alerts
  - in-app quiet hours

## 9. Left for implementation
These aren't open decisions. They're checks and choices the build will hit:
- **PowerSync attachments:** the built-in `AttachmentQueue` in `@powersync/common` vs the spike's minimal custom queue. This is an implementation-time choice.
- **Native release builds:** retest the default HTTP streaming sync. It hung only on the dev build; keep WebSocket unless HTTP proves fine.
- **RLS UPDATE/DELETE rejection** through PostgREST wasn't exercised live in the spike. The sync suite's "RLS rejection while offline" scenario covers it.
- **Docs to write:** `docs/secrets.md` (secrets inventory) and `docs/infra.md` (DNS checklist).
- **Clean up the spike's throwaway resources:** the Cloudflare Worker `hisaab-spike`, the EAS project `hisaab-spike`, the spike tables and bucket in the Supabase project, and the PowerSync instance.

## Superseded details
Where an earlier ticket was later corrected:
- **Sign in with Apple:** [Platform pick](https://github.com/khanate-dev/hisaab/issues/11) listed it as conditional. [Backend](https://github.com/khanate-dev/hisaab/issues/7) chose OTP only, and [Navigation](https://github.com/khanate-dev/hisaab/issues/17) dropped it from the compliance set.
- **Web hosting:** [Backend](https://github.com/khanate-dev/hisaab/issues/7) said Cloudflare Pages; the [Spike](https://github.com/khanate-dev/hisaab/issues/14) moved it to Workers static assets.
- **OXR historical on the free plan:** flagged as unverified in [Backend](https://github.com/khanate-dev/hisaab/issues/7); verified in the [Spike](https://github.com/khanate-dev/hisaab/issues/14).
- **Keep-alive:** extended from Supabase only to Supabase + PowerSync by the [Spike](https://github.com/khanate-dev/hisaab/issues/14).
