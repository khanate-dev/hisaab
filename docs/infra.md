# Prod infrastructure checklist

The one-off setup behind `deploy.yml` (ADR-0011), done by hand once, in this order. Names of secrets are in
[`secrets.md`](secrets.md).

## 1. Supabase

1. Create the prod project (free tier). Note the ref, the database password and the **session pooler** connection
   string.
2. Auth → JWT Keys: migrate to asymmetric keys and make **ES256** the current key, so PowerSync can verify tokens through
   `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`.
3. Settings → API Keys: check there's a secret key (`sb_secret_…`); `deploy` writes the first one to Vault for pg_cron.
4. The rest is code: `deploy` runs `db push`, `config push` (with `supabase/remotes/prod.toml` on top of `config.toml`),
   `secrets set`, `functions deploy` and the Vault secrets.

After the first deploy, check that the Edge Functions that import `packages/domain` (outside `supabase/functions`) were
bundled: `curl -X POST https://<ref>.supabase.co/functions/v1/delete-account` answers with JSON (a 401 or 426), not a
boot error. If the bundle misses them, add an import map.

## 2. PowerSync Cloud

1. Create an instance and connect it to the Supabase database (the direct connection or the session pooler, as the
   dashboard suggests; the `postgres` password).
2. Client auth:
   - JWKS URI `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, audience `authenticated`.
   - An HS256 key for the keep-alive: kid `keepalive`, and as its value the base64url of the bytes of
     `POWERSYNC_KEEPALIVE_KEY` (`echo <hex> | xxd -r -p | basenc --base64url | tr -d =`).
3. Make a personal access token for `deploy`. `deploy` pushes only `powersync/sync-config.yaml`; the instance's own
   config stays as set here.

## 3. Cloudflare

1. R2: create the backup bucket, with a lifecycle rule deleting objects after **30 days** (the privacy policy says so).
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
store support contact and the `reply_to` on outgoing mail.

In Resend, add the domain `mail.hisaab.khanate.pk` and make an API key limited to sending from it: that key is
`RESEND_SMTP_PASSWORD`.

## 5. Expo

1. Make a robot user and its access token (`EXPO_TOKEN`).
2. Run `eas init` in `apps/app` and commit the project id it writes into `app.json`; the web deploy refuses to run
   without it.
3. Add the `production` environment variables from [`secrets.md`](secrets.md#eas-production-environment).

## 6. GitHub

1. Create the Environment `prod` and add its secrets. Limit it to the `main` branch.
2. Turn on secret scanning and push protection.
3. Generate the Web Push keys on your machine (`npx web-push generate-vapid-keys`) straight into the secrets, and the
   keep-alive key (`openssl rand -hex 32`).

## 7. First deploy

1. Add the repo variable `PROD_ENABLED` = `true` (Settings → Secrets and variables → Actions → Variables); until then
   `deploy` and `keepalive` skip. Then re-run the latest `ci` on `main` (or merge anything): `deploy` follows it.
2. Run `keepalive` by hand once and check both jobs pass.
3. Open `https://hisaab.khanate.pk`, sign in with an email code (Resend delivers it), and check a second device syncs.
