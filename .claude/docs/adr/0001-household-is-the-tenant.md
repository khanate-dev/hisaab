# The household is the tenant; isolation is enforced below the app

Hisaab opens self-service sign-up from day one, so strangers share one deployment. We made the **Household** the only unit of data ownership and isolation, and every User gets an automatic Personal household. There is no user-owned financial data and nothing mutable is shared across households: categories are copied per household from a built-in template, and names are unique at most within a household. Every tenant-owned row, child rows included, carries `household_id` and a client-generated UUIDv7 id. Everything lives in one shared database. Isolation is enforced at a single chokepoint below application code (database row-level security or sync-engine permission rules), not by per-query filters. A forgotten filter therefore fails closed instead of leaking another household's finances. There is no in-app platform super-admin; the operator works through the database or backend console.

## Considered Options

- **User-owned personal data plus household-owned shared data** (the old schema's nullable `wallets.household_id`). Rejected: two ownership paths to secure, query and sync.
- **Database per tenant.** Rejected: it doesn't fit free or cheap hosting tiers, and it multiplies migrations and sync setup.
- **Global categories, and global uniqueness for household and category names** (the old schema). Rejected: one tenant's edits would leak to others, and a "name taken" error reveals that another household exists.
- **Auto-increment integer ids.** Rejected: they are enumerable across tenants, and an offline client can't mint them.
- **A platform-admin role.** Rejected: a permanent bypass of the isolation chokepoint, and the most valuable account to compromise.

## Consequences

- Leaving a household leaves your entries with it. Deleting your account deletes your Personal household and anonymizes your entries elsewhere as "Former member". The last Admin can't leave. Deleting a household hard-deletes all of its data. Data export is per household, for its Admins.
- Households are joined only via expiring, revocable Invites; there is no permanent invite code.
- Abuse and rate-limiting hardening for open sign-up remains out of scope for the current spec effort.

Decided in [Multi-tenancy scope](https://github.com/khanate-dev/hisaab/issues/4).

## Amendment: one authority, two enforcement paths

Under the Supabase + PowerSync stack (ADR-0007), two layers enforce isolation:

- **Postgres RLS** governs every direct access: uploads, Storage, Edge Functions and API reads.
- **PowerSync Sync Streams** decide what each device downloads. PowerSync replicates with a privileged role, so RLS does not apply to downloads.

RLS remains the single **source of truth**, and Sync Streams must be a strict **subset** of what RLS allows. A deploy-blocking test enforces this. It seeds users in every Role across several households and asserts that every row a stream would send that user is also readable under RLS for that user. Both rule sets key off the same membership table (`household_id` + Role).

Amended in [Backend & data-layer architecture](https://github.com/khanate-dev/hisaab/issues/7).

## Amendment: account deletion

Account deletion is immediate and server-side. It needs a connection, a fresh email OTP and a typed confirmation, and it first offers a Full backup of the Personal household. There is no grace period.

- **Sole Admin of a shared household with other Members:** deletion is blocked until they promote another Admin or delete that household. A shared household with no other Members is deleted along with the account, like the Personal household.
- **Attribution:** each deleted User becomes a separate, anonymous Former member per Household, with no name or email kept. Entries, the Activity log (before/after values untouched) and Recurring rules stay, attributed to it. Generated labels such as "Contribution from …" are rendered from the author reference and never stored as text. Free text that members typed is never rewritten.
- **Kept:** Attachments on shared-household Entries, and Recurring rules (which keep running).
- **Deleted:** the Personal household and its Attachments, Saved filters, notification preferences and inbox, device and session rows (devices wipe their local replica on next contact), and the Auth user (so the email is free to sign up again). Pending Invites the User created are revoked.
- **Backups:** the nightly off-site dumps expire within 30 days and are never edited, and the privacy policy says so. A deletion ledger (only the opaque user id and deletion time) is re-applied after any disaster-recovery restore. Full backups an Admin made earlier are that household's own copy and are out of scope.

Amended in [Account deletion semantics](https://github.com/khanate-dev/hisaab/issues/12).
