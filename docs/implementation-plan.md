# Hisaab rebuild: implementation plan

Phased plan for building [the handoff spec](spec.md). Each slice is a vertical tracer bullet (schema + RLS + sync + UI + tests) with its blocking edges. Phase 0 is the unavoidable horizontal prefactor. The source for each area stays the spec, its tickets and the ADRs; this plan only sequences the work.

Feed this file to `/to-tickets` to publish it as GitHub issues.

## Phase 0: Foundation

- **0.1 Workspace reset.** Delete the old Remix app. pnpm workspace with catalogs (exact versions, seeded from the Spike's tested set), TS, ESLint flat config, Prettier, cspell, Vitest. Money lint guard (no `SUM`/`AVG` on money columns on the device). Blocked by: none.
- **0.2 Local stack.** Supabase CLI + self-hosted PowerSync Service in Docker, ES256 JWT keys verified via JWKS, `.env.local`. Blocked by: 0.1.
- **0.3 `ci.yml`.** Typecheck, lint, Vitest, migrations from zero, `supabase test db`, pgTAP meta-test (every `public` table has RLS and a policy), sync harness boots. Blocked by: 0.2.

## Phase 1: Walking skeleton

- **1.1 Sign in to a synced Personal household.** Email OTP; a server trigger creates the Personal household and its Membership; Sync Streams deliver it; the client shows it via a Drizzle watched query. RLS ⊇ Sync Streams differential test on the adversarial seed. Blocked by: 0.3.
- **1.2 Upload connector and rejections.** Empty `.select()` result counts as a rejection; local-only `upload_errors`; Sync status sheet. Sync scenarios: last-writer-wins, update vs delete, RLS rejection while offline. WebSocket on native, HTTP on web. Blocked by: 1.1.
- **1.3 Contract version gate.** `app_config` on a global stream; `x-contract-version` header; `db_pre_request` 426 and the shared Edge Function helper; "Update required" hard block keeping the queue; ops stamped with contract version; upcaster chain (identity for now); ADR-0009 drift checks in CI. Blocked by: 1.2.
- **1.4 Theme and app shell.** Neobrutal tokens, Archivo Black + Space Grotesk, dark mode (OS + per-device override), owned primitives on `@rn-primitives` (Button press-in, Card, Sheet, Dialog), tabs + top bar, sidebar from 1024px, Lingui, Lucide icon-key registry. Blocked by: 0.1.
- **1.5 Prod deploy.** `deploy.yml` (`pg_dump` to R2, then DB, then Sync Streams, then web on Workers at `hisaab.khanate.pk`); `/privacy` and `/support` routes; `keepalive.yml` for Supabase and PowerSync; `docs/secrets.md` and `docs/infra.md`. Blocked by: 1.1.

## Phase 2: Core money

- **2.1 First Wallet onboarding.** Name, then First Wallet (Cash with opening Balance adjustment; currency sets the Base currency). Wallets list with derived Balance. `Money` type in `packages/domain` with fast-check property tests. Blocked by: 1.2, 1.4.
- **2.2 Wallet management.** All four Wallet types, edit/archive, negative-balance warning, Wallet detail with balance history. Blocked by: 2.1.
- **2.3 Categories and Expense/Income.** Categories copied from the built-in template (Subcategories, icon key, colour); full add/edit/delete form for Expense and Income; date in household timezone; Entries list, Entry detail, recent Entries on Home. Blocked by: 2.1.
- **2.4 Quick-add sheet.** In-app keypad, Recent chips, description autocomplete; 3-tap repeat Entry. Blocked by: 2.3.
- **2.5 Itemized Expense.** Total first; dashed Rest becomes "Other <category>" on save; Items count in their own Category. Blocked by: 2.3.
- **2.6 Same-household Transfer and Balance adjustment sheet.** Blocked by: 2.2.
- **2.7 Activity log.** Append-only trigger (device time, sync time, before/after); viewer; restore deleted Entry. Blocked by: 2.3.
- **2.8 Contacts, Loans and Repayments.** Lent/Borrowed, derived outstanding, settle at zero or write-off; Home Loans tile shown only while a Loan is outstanding. Blocked by: 2.6.

## Phase 3: Households and access

- **3.1 Shared households.** Create household; switcher sheet; last-used household per device; household settings (Base currency locked once any Entry exists, Budget month start day, timezone); default Wallet per member per household. Blocked by: 2.3.
- **3.2 Invites and joining.** Expiring, revocable, optionally email-tied Invites with a preset Role; accept-invite Edge Function; Invite landing, then OTP, then Join; pgTAP Role matrix (Admin, Member, Viewer, outsider, anon); read-only UI for Viewers. Blocked by: 3.1.
- **3.3 Members and Roles.** Change Roles; leave (last Admin blocked); Admin-only hard delete of a household. Blocked by: 3.2.
- **3.4 Cross-household transfer.** "To" picker grouped by household; linked mirrored pair. Sync scenario: mirrored transfers. Blocked by: 2.6, 3.1.

## Phase 4: Multi-currency

- **4.1 Exchange rates.** `exchange_rates` table; daily OXR Edge Function on pg_cron; cross rates from USD; synced to devices; fetch logic behind adapters, tested with Vitest fakes. Blocked by: 1.5.
- **4.2 Non-base Wallets.** Frozen, editable Base amount; "rate estimated" offline, corrected on sync unless user-edited; Base amount editor sheet; cross-currency Transfer with editable Received amount. Blocked by: 4.1, 2.6, 3.4.

## Phase 5: Budgets and recurring

- **5.1 Budgets.** Budget month math with a custom start day (property tests); standing Budget + per-month override; Expected income; Budget month view with Pace; top 3 budgets on Home. Blocked by: 2.5, 3.1.
- **5.2 Recurring rules and confirming.** Schedules; deterministic Occurrence ids; rule editor; Pending list with batch confirm; variable bills ask for amount; household-wide Skip and Snooze; Pending card on Home. Sync scenario: duplicate Occurrence confirms. Blocked by: 2.3.
- **5.3 Auto-record.** Who creates auto-recorded Entries (server pg_cron or client) per ADR-0004. Rule edits affect future Occurrences only. Blocked by: 5.2.

## Phase 6: Reports

- **6.1 Report engine and first report.** Engine in `packages/domain` (excludes Balance adjustments and Pending; by-member filter; Budget-month ranges; comparisons vs previous period and 3-month average); `<BarChart>`/`<DonutChart>` wrappers; Reports hub; Spending by category; drill-down into the filtered Entries list. Blocked by: 5.1, 4.2.
- **6.2 Budget vs actual, Income vs expense, Category trend.** Blocked by: 6.1.
- **6.3 Net worth, Loans summary, My overview.** Display currency; cross-household pairs cancel out. Blocked by: 6.1, 2.8.

## Phase 7: Search, Attachments and data tools

- **7.1 Search.** On-device free text, amount syntax (`2500`, `>2000`), full filter set, private Saved filters. Blocked by: 2.3.
- **7.2 Attachments.** Built-in `AttachmentQueue` (fall back to the Spike's custom queue only if needed); images ~2000px, PDFs ≤ ~10 MB, max 5 per Entry; thumbnails sync, full files lazy and cached; 90-day purge for deleted Entries. Blocked by: 2.3.
- **7.3 Spreadsheet export.** Blocked by: 7.1.
- **7.4 Full backup and restore.** Built and restored on device into a new household. Blocked by: 7.2.
- **7.5 CSV import wizard.** Column mapping saved per Wallet; likely duplicates flagged. Blocked by: 2.3.

## Phase 8: Notifications

- **8.1 Outbox and inbox.** `notifications` + `notification_deliveries`; per-minute pg_cron drain Edge Function; inbox UI; preferences per household × trigger; Membership trigger first; 90-day inbox purge. Blocked by: 3.2.
- **8.2 Push channels.** Expo Push and VAPID Web Push; device registration; permission asked in context; no amounts in push text. Blocked by: 8.1.
- **8.3 Remaining triggers.** Recurring due, Auto-recorded, Budget threshold (80%/100%), Loan due, Activity digest at 20:00, Monthly summary email via Resend at 09:00 household time. Blocked by: 8.2, 5.3, 6.1.

## Phase 9: Account, release and launch

- **9.1 Account deletion.** Edge Function; fresh OTP + typed confirmation; offers Full backup first; blocked for sole Admin of a populated shared household; per-household Former member; private data deleted; Invites revoked; deletion ledger. Blocked by: 3.3, 7.4.
- **9.2 Device settings.** Biometric app lock (native, off by default); appearance override; web persistent-storage request and unsynced-changes warning. Blocked by: 1.4.
- **9.3 Native and nightly pipelines.** EAS config (fingerprint `runtimeVersion`, `preview`/`production` channels); `release.yml` + smoke checklist; `nightly.yml` (R2 backup, big fast-check fuzz); `contract` label and Squawk/DDL check in CI. Blocked by: 1.5.
- **9.4 Launch.** Privacy labels and Data safety form; Play closed test (12 testers × 14 days — start early); clean up Spike resources; retest HTTP sync on a native release build. Blocked by: 9.1, 9.3.

## Critical path

0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 2.1 → 2.3 → 3.1. Parallel tracks: 1.4 (theme/shell), 1.5 → 9.3 (pipelines), and domain property tests per slice. The 9 sync scenarios from ADR-0010 are folded into the slices that introduce their behaviour.
