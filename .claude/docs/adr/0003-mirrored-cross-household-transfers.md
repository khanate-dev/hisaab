# Cross-household transfers are mirrored pairs, not shared rows

Moving money from a Personal household to a shared one (e.g. salary into the joint wallet) crosses tenants. ADR 0001 makes every row belong to exactly one Household. So a Cross-household transfer is two linked, mirrored Entries, one owned by each Household, created in one action by a User who is a member of both. Each Household sees only its own half; the shared household sees "Contribution from Muhammad", never the source wallet. Edits made by that User update both halves. If the User leaves either Household, the link breaks and the halves become independent Entries.

## Considered Options

- **One shared row visible to both households.** Rejected: it breaks single-household ownership and adds an exception to the isolation chokepoint.
- **No cross-household transfers.** Rejected: users would log an expense and an income by hand, and the two could drift apart.

Decided in [Core money model](https://github.com/khanate-dev/hisaab/issues/5).
