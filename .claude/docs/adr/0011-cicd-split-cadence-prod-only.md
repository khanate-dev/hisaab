# CI/CD: prod only, continuous backend and web, gated native releases

**There is one cloud stack: prod.** There's no staging Supabase project and no second PowerSync instance. Development and CI run on the local Docker stack (Supabase plus a self-hosted PowerSync Service) that ADR-0010 already requires. A second free-tier stack would double the keep-alive pings, the secrets and the drift for little gain, because CI already applies migrations from zero and runs the real sync harness, and expand/contract makes every migration safe against live old clients. Two gaps are left: local vs Cloud configuration, and real push and email. To narrow the first, all configuration is code: `supabase/config.toml` (via `config push`) and the PowerSync CLI config. The release smoke checklist runs against prod. Internal and TestFlight builds also use prod data.

**Split cadence.** Backend and web deploy on every merge to `main`. Native ships only through a manual release. We rejected a tag-triggered release train for everything, because expand/contract already makes each merged migration safe, and the manual pause belongs only where ADR-0010 puts the smoke checklist.

## Workflows

- **`ci.yml`** runs on every PR and on every push to `main`, with no secrets. That matters because the repo is public and forks open PRs. It runs everything in ADR-0010, the ADR-0009 drift checks, migrations applied from zero and a `supabase functions serve` smoke run. It also runs Squawk on the migration SQL, plus a custom check for writes to `min_contract_version`. Any destructive DDL (`DROP`, `SET NOT NULL`, a tightened `CHECK`, a retype) or a contract-version raise requires the PR to carry a `contract` label, or CI fails. A raise to N also requires the EAS `production` channel to already hold an update stamped with contract version ≥ N for every live `runtimeVersion` (checked with `eas update:list --json`).
- **`deploy.yml`** runs on merge to `main` once `ci` has passed, in the GitHub Environment `prod`. Its jobs are chained with `needs:`, which enforces the ADR-0009 expand order:
  1. A `pg_dump` snapshot to R2, so a restore is never more than one merge behind.
  2. `supabase db push`, `config push`, `secrets set` and `functions deploy`. When the commit holds a `contract` migration, this job runs in the `prod-contract` Environment, whose required reviewer (the owner, self-approval allowed) confirms that the store builds are approved and at 100% on both stores. Store rollout isn't automated, which would need App Store Connect and Play API keys in CI, for a step that happens rarely.
  3. The PowerSync CLI deploy of `powersync/sync-config.yaml`.
  4. `eas env:pull`, then `expo export -p web`, then `wrangler deploy --assets dist`.
- **`release.yml`** is a `workflow_dispatch` that takes a semver bump input. It refuses to run unless `deploy` has succeeded for this commit or an earlier one, so native never gets ahead of the backend. It runs `eas fingerprint:compare` against the latest production store build:
  - **If the fingerprint matches**, it publishes an OTA update to the `preview` channel. It then waits on the `prod-release` Environment, where the smoke checklist is ticked against that exact update, and runs `eas update:republish` to `production`. The artifact that was tested is the artifact that ships.
  - **If it doesn't match**, it runs `eas build --profile production` and `eas submit` for both platforms. Play uses a staged rollout and iOS a phased release.

  Either way it tags `vX.Y.Z`.
- **`nightly.yml`** runs the R2 backup (DB dump and Attachments, kept 30 days) and the big-`numRuns` fast-check fuzz, which opens an issue on failure.
- **`keepalive.yml`** runs a daily ping to Supabase and PowerSync Cloud.

## Versioning

- **`runtimeVersion` uses `{ policy: "fingerprint" }`,** so the runtime changes only when native code or deps change. We rejected `appVersion`, which would force a store build for JS-only releases, and there's no Mac and only 15 builds a month.
- **There are two EAS channels, `preview` and `production`.** Both point at prod data. Internal builds (an Android APK and TestFlight) listen on `preview`.
- **`version` is user-facing semver,** set by the release input. Build numbers use `appVersionSource: "remote"` with `autoIncrement`, so the repo never needs a bump commit.
- **Every update's metadata is stamped with its contract version.** That stamp feeds the CI check above.

## Secrets

Each secret lives only where it is used, with one owner. A `docs/secrets.md` inventory lists the name, where it lives, what uses it and how to rotate it. Rotation is manual. GitHub secret scanning and push protection are on.

- **GitHub Environment `prod`** is the only place `deploy`, `release`, `nightly` and `keepalive` get secrets from:
  - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` (the session pooler, for `pg_dump`)
  - the Supabase Storage S3 keys, for reading during the Attachment backup
  - `POWERSYNC_ADMIN_TOKEN` and the instance id
  - `CLOUDFLARE_API_TOKEN`, scoped to the Workers deploy
  - the R2 keys, scoped to the backup bucket
  - `EXPO_TOKEN`, from a robot user
  - `RESEND_SMTP_PASSWORD`, substituted into `config.toml` through `env()` for Auth SMTP
- **Supabase Edge Function secrets** are `RESEND_API_KEY`, `OXR_APP_ID`, `VAPID_PRIVATE_KEY` and `EXPO_PUSH_ACCESS_TOKEN`. `deploy` sets them from GitHub, so GitHub stays the source. The service role key is auto-injected and never copied anywhere.
- **EAS** manages the native push credentials (the FCM v1 service account and the APNs key) and signing. The public client config lives in EAS env vars under `production`: the Supabase URL, the publishable key, the PowerSync URL and the VAPID public key. The web build pulls them with `eas env:pull`, so native and web share one source.
- **Locally,** a gitignored `.env.local` points at the Docker stack. No prod secret lives on the dev machine.

## Domain and DNS

`khanate.pk` is already on Cloudflare DNS, with Email Routing for inbound mail. The records are a manual one-off checklist in `docs/infra.md`. We didn't use Terraform.

- **The web app is served at `hisaab.khanate.pk`** as a Workers custom domain. The store-compliance pages are routes in the same static export: `/privacy` and `/support`.
- **Resend sends from `mail.hisaab.khanate.pk`,** as `Hisaab <no-reply@mail.hisaab.khanate.pk>`. Its SPF, DKIM and bounce MX records live only on that subdomain, so the root SPF and Email Routing are untouched.
- **The subdomain gets its own DMARC.** `_dmarc.mail.hisaab.khanate.pk` starts at `p=none` with `rua`, and moves to `p=quarantine` once reports come back clean.
- **Support mail is forwarded.** `support@hisaab.khanate.pk` forwards to the owner's inbox through Email Routing. It's the store support contact and the `reply_to` on outgoing mail.

Decided in [CI/CD pipeline, deploy gates & secrets](https://github.com/khanate-dev/hisaab/issues/18).
