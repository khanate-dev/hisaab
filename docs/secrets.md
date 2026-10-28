# Secrets inventory

Every secret lives only where it's used, with one owner (ADR-0011). Rotation is manual: make the new value, put it in
the place listed, re-run whatever reads it, then revoke the old one. GitHub secret scanning and push protection are on.
No prod secret lives on a dev machine; locally, a gitignored `.env.local` points at the Docker stack.

## GitHub Environment `prod`

The only place `deploy`, `keepalive` (and later `release` and `nightly`) get secrets from.

| Name | What it is | Used by | Rotate |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token | `deploy` (link, push, deploy, api-keys) | Account → Access Tokens; replace, re-run `deploy` |
| `SUPABASE_PROJECT_REF` | The prod project's ref (not secret, kept with the rest) | `deploy` | Never changes |
| `SUPABASE_DB_PASSWORD` | The `postgres` password | `deploy` (`db push`) | Database settings → reset password; update this and `SUPABASE_DB_URL` |
| `SUPABASE_DB_URL` | Session pooler connection string, password included | `deploy` (snapshot, Vault) | With the password above |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | `keepalive` | Never changes |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key (public; kept here for one source) | `keepalive` | Settings → API Keys |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 API token, Object Read & Write, on the backup bucket only | `deploy` (snapshot) | R2 → Manage API tokens; replace both |
| `R2_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` | `deploy` | Never changes |
| `R2_BUCKET` | The backup bucket's name | `deploy` | Never changes |
| `POWERSYNC_ADMIN_TOKEN` | PowerSync personal access token | `deploy` (sync config) | Dashboard → Account → Access tokens |
| `POWERSYNC_INSTANCE_ID` | The prod instance's id | `deploy` | Never changes |
| `POWERSYNC_URL` | The instance's URL | `keepalive` | Never changes |
| `KEEPALIVE_EMAIL`, `KEEPALIVE_PASSWORD` | The keep-alive User: an ordinary account with only its own empty Personal household, signed in by password | `keepalive` | Auth → Users → the User → reset password; replace here |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token: Workers Scripts Edit, Workers Routes Edit and DNS Edit on `khanate.pk` | `deploy` (web) | My Profile → API Tokens → Roll |
| `CLOUDFLARE_ACCOUNT_ID` | The account id (not secret) | `deploy` (web) | Never changes |
| `EXPO_TOKEN` | Access token of an Expo robot user | `deploy` (`eas env:pull`) | Expo → Robot users; replace |
| `RESEND_SMTP_PASSWORD` | A Resend API key, sending access, `mail.hisaab.khanate.pk` only | `deploy` (`config push`, Auth SMTP) | Resend → API Keys; replace, re-run `deploy` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keypair (`npx web-push generate-vapid-keys`) | `deploy` → Edge Function secrets | Rotating drops every web push subscription; also update `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in EAS |
| `VAPID_SUBJECT` | `mailto:support@hisaab.khanate.pk` | `deploy` → Edge Function secrets | — |

## Supabase

| Name | Where | Used by | Rotate |
|---|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Edge Function secrets | `dispatch-notifications` | Set by `deploy` from GitHub; rotate there |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase | Edge Functions | Never copied anywhere |
| `project_url`, `service_role_key` | Vault | pg_cron → `dispatch-notifications`, `raise-notifications`, `purge-attachments` | Written by `deploy` from the project's first `sb_secret_` key; rotating that key in Settings → API Keys and re-running `deploy` updates it |
| JWT signing key (ES256) | Auth → JWT Keys | Auth; PowerSync verifies through the JWKS | Rotate in the dashboard: add a standby key, then rotate; the JWKS serves both meanwhile |

Later issues add `RESEND_API_KEY`, `OXR_APP_ID` and `EXPO_PUSH_ACCESS_TOKEN` to the Edge Function secrets, set the same
way.

## PowerSync Cloud

| Name | Where | Used by | Rotate |
|---|---|---|---|
| Database password | Instance → Database connection | Replication from Supabase | With `SUPABASE_DB_PASSWORD` |

## EAS (`production` environment)

Public client config, which both the native builds and the web build (`eas env:pull` in `deploy`) read. None of it is
secret, but it has one source.

| Name | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key |
| `EXPO_PUBLIC_POWERSYNC_URL` | The instance's URL |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | Same as `VAPID_PUBLIC_KEY` |
| `EXPO_PUBLIC_WEB_URL` | `https://hisaab.khanate.pk` (Invite links) |

EAS also holds the native push credentials (FCM v1 service account, APNs key) and signing; #66 sets those up.
