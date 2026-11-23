# Prod infrastructure checklist

The one-off setup behind `deploy.yml` (ADR-0011), done by hand once, in this order. Names of secrets are in
[`secrets.md`](secrets.md).

## 1. Supabase

1. Create the prod project (free tier). Note the ref, the database password and the **session pooler** connection
   string.
2. Auth → JWT Keys: migrate to asymmetric keys and make **ES256** the current key, so PowerSync can verify tokens through
   `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`.
3. Storage → S3 Connection: turn the S3 protocol on and make an access key for `nightly` (the
   `SUPABASE_S3_*` secrets).
4. Settings → API Keys: check there's a secret key (`sb_secret_…`); `deploy` writes the first one to Vault for pg_cron.
5. Auth → Users → Add user: the keep-alive User, with a long random password and "Auto confirm" on. Its email and
   password are `KEEPALIVE_EMAIL` and `KEEPALIVE_PASSWORD`; `keepalive` signs in as it every day, so both free tiers
   see a real device's activity. It owns nothing but its own empty Personal household.
6. The rest is code: `deploy` runs `db push`, `config push` (with `supabase/remotes/prod.toml` on top of `config.toml`),
   `secrets set`, `functions deploy` and the Vault secrets.

The Edge Functions import `packages/domain` from outside `supabase/functions`; `deploy` checks after each
`functions deploy` that one of them boots (it refuses an anonymous call with a 4xx, not a 5xx). If the first deploy
fails there, the bundle missed those files: add an import map.

## 2. PowerSync Cloud

1. Create an instance and connect it to the Supabase database (the direct connection or the session pooler, as the
   dashboard suggests; the `postgres` password).
2. Client auth: JWKS URI `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, audience `authenticated`. Nothing else: every
   token PowerSync accepts is one Supabase Auth signed.
3. Make a personal access token for `deploy`. `deploy` pushes only `powersync/sync-config.yaml`; the instance's own
   config stays as set here.

## 3. Cloudflare

1. R2: create the backup bucket, with a lifecycle rule deleting objects after **30 days** (the privacy policy says so).
   It holds a snapshot per deploy (`deploys/`) and a nightly backup of the database and every Attachment file
   (`nightly/`): about 30 copies of the files at any time, so watch its size against the free 10 GB.
   Make an R2 API token with Object Read & Write on that bucket only.
2. Make an API token for Workers: Account → Workers Scripts Edit; Zone `khanate.pk` → Workers Routes Edit and DNS Edit.
   The first `wrangler deploy` creates the `hisaab.khanate.pk` custom domain and its DNS record.

## 4. DNS and mail (`khanate.pk`)

| Record | Name | Value | Why |
|---|---|---|---|
| Custom domain | `hisaab.khanate.pk` | Made by `wrangler deploy` | The web app, `/privacy`, `/support` |
| TXT (SPF) | `send.mail.hisaab.khanate.pk` (as Resend shows) | From Resend | Resend's sending |
| MX | `send.mail.hisaab.khanate.pk` (as Resend shows) | From Resend | Resend's bounces |
| TXT (DKIM) | `resend._domainkey.mail.hisaab.khanate.pk` | From Resend | Signing |
| TXT (DMARC) | `_dmarc.mail.hisaab.khanate.pk` | `v=DMARC1; p=none; rua=mailto:<your inbox>` | Starts at `p=none`; move to `p=quarantine` once reports are clean |

The root SPF and Email Routing stay untouched. In Email Routing, add `support@hisaab.khanate.pk` → your inbox: it's the
store support contact (and, once the app sends its own mail through Resend, the `reply_to`).

In Resend, add the domain `mail.hisaab.khanate.pk` and make an API key limited to sending from it: that key is
`RESEND_SMTP_PASSWORD`.

## 5. Open Exchange Rates

Sign up for the free plan (USD base, 1,000 requests a month) and copy the App ID into `OXR_APP_ID`. The fetcher spends
at most 900 a month, retries included: today's rates once a day, and the past dates devices ask for (at most 31 a
day per User). A date that fails is tried again hourly, 5 times at most.

## 6. Expo

1. Make a robot user and its access token (`EXPO_TOKEN`).
2. Run `eas init` in `apps/app` and commit the project id it writes into `app.json`; the web deploy refuses to run
   without it. (Done: `apps/app/app.json` holds it, with the updates URL.)
3. Add the `production` environment variables from [`secrets.md`](secrets.md#eas-production-environment).
4. Store signing and submitting, once, in EAS (`eas credentials` in `apps/app`): the Android keystore (EAS makes one)
   and FCM v1 service account; the iOS distribution certificate, provisioning profile and APNs key; a Google Play
   service account key with release access, for `eas submit`; and an App Store Connect API key.
5. Create the store listings: the app in App Store Connect (bundle id `pk.khanate.hisaab`) and in the Play Console
   (package `pk.khanate.hisaab`). Play takes the very first AAB only by hand: run `eas build --profile production
   --platform android` once and upload it in the Play Console; `release` submits every one after.
6. In App Store Connect, turn on **Phased Release for Automatic Updates** for each version (`eas submit` can't);
   Play's staged rollout (10% first) is in `eas.json`. Raise either to 100% in its console once the version looks
   well.

## 7. GitHub

1. Create the Environment `prod` and add its secrets. Limit it to the `main` branch.
2. Create the Environment `prod-contract` with the same secrets as `prod`'s database job (the `SUPABASE_*`,
   `RESEND_SMTP_PASSWORD`, `VAPID_*`, `OXR_APP_ID` and `EXPO_TOKEN` ones), you as required reviewer and self-approval allowed. `deploy` runs the
   database job there when a merged PR carries the `contract` label, and always for a `min_contract_version` raise.
3. Create the Environment `prod-release` with `EXPO_TOKEN`, you as required reviewer and self-approval allowed.
   `release` waits there with an OTA update on `preview` until you've passed the
   [smoke checklist](release-smoke.md) against it, then republishes it to `production`.
4. Turn on secret scanning and push protection.
5. Generate the Web Push keys on your machine (`npx web-push generate-vapid-keys`) straight into the secrets.

## 8. First deploy

1. Add the repo variable `PROD_ENABLED` = `true` (Settings → Secrets and variables → Actions → Variables); until then
   `deploy` and `keepalive` skip. Then re-run the latest `ci` on `main` (or merge anything): `deploy` follows it.
2. Run `keepalive` by hand once and check it passes.
3. Open `https://hisaab.khanate.pk`, sign in with an email code (Resend delivers it), and check a second device syncs.

## Restoring

Backups live in the R2 bucket for 30 days: `deploys/<time>-<sha>/` before each deploy, `nightly/<date>/` each night
(the database as `roles`, `schema` and `data` dumps, and the Attachment files).

1. Pick the newest backup from before whatever went wrong.
2. Before restoring over a live database, export `private.deletion_ledger` from it: the spec has it re-applied after
   any restore, and the backup's own copy stops at the night it was taken.
3. Restore into a fresh project (or the reset one): `roles.sql`, then `schema.sql`, then `data.sql` with
   `session_replication_role = replica` (the data dump has circular foreign keys), then the Attachment files into the
   `attachments` bucket.
4. Re-apply the ledger: for every User it lists whom the restore brought back, run `public.delete_account(<id>)` as
   the service role, as the original deletion did.
5. Redeploy (`deploy` re-runs migrations newer than the backup, config, functions and Sync Streams) and check a
   device syncs.
