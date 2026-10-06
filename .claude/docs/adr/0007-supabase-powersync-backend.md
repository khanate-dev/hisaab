# Supabase + PowerSync on free tiers, with decimals on the device

The backend is **Supabase**: Postgres with row-level security, Auth, Storage, Edge Functions and pg_cron. **PowerSync Cloud** is the offline sync layer, with an on-device SQLite replica and a durable upload queue, through its official Expo and web SDKs. The research is in `docs/research/backend-data-layer.md`.

We rejected the alternatives:

- **InstantDB:** its cloud shuts down on 2027-08-31.
- **Convex:** no official offline writes.
- **Firebase:** no decimal type, transactions fail offline, the paid Blaze plan is needed for Storage and cron, and lock-in is high.
- **Electric + TanStack DB:** every client piece is 0.x, and we would build the write path ourselves.
- **A hand-rolled API on Neon and Workers:** the most maintenance, and PowerSync keeps Neon awake past its free tier.

The exit route is plain Postgres, and the PowerSync Service can be self-hosted.

Decisions that come with the stack:

- **Conflicts:** last writer wins per row, in server-arrival order. The upload handler sends whole rows, so PowerSync's per-field patches are never used. Writes the server rejects are surfaced as "couldn't sync" items, never dropped silently.
- **Money stays `numeric`** (exact decimals in the actual unit, per Core money model). PowerSync delivers it to the device as text, which is parsed into a decimal type and never into a float. SQL on the device may filter and group money rows, but must never `SUM` or `AVG` them. Totals are computed in JS through a typed `Money` accessor, and a lint/test guard enforces this. We rejected integer minor units in favour of keeping the domain's decimal model.
- **Auth is email OTP only.** No passwords and no social login, so Sign in with Apple isn't required. Adding any social login later must add Apple alongside it.
- **Free tiers through launch.** Paid tiers come only when a hard limit bites. Because Supabase Free has no backups, a nightly GitHub Actions job copies a database dump **and the Attachment files** to Cloudflare R2, kept for 30 days. A daily keep-alive ping stops the Supabase and PowerSync free tiers from pausing. Image transformations are Pro-only, so thumbnails are generated on the device. Web is a static Expo export on Cloudflare Pages.
- **Attachments** use our own small upload queue, not PowerSync's alpha attachment helpers.
- **Exchange rates** come from Open Exchange Rates (free plan, USD base) behind an adapter. The server computes cross rates and stores each date once in `exchange_rates`. Fetching history for past-dated Entries is queued to stay under the 1,000 requests/month cap.
- **The Full backup is built and restored on the Admin's device,** which avoids Edge Function memory and time limits.
- **Web storage eviction:** at first launch the app calls `navigator.storage.persist()`. It shows an unsynced-changes indicator and warns before the tab closes. A per-device heartbeat lets the server tell a returning device that it lost changes made offline. Detection is best-effort.

Isolation keeps one authority: RLS. Sync Streams must be a subset of it (see the amendment to ADR-0001).

Decided in [Backend & data-layer architecture](https://github.com/khanate-dev/hisaab/issues/7).
