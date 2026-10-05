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
