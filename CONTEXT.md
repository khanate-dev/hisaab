# Hisaab

Household finance tracking: people record and budget money together within the households they belong to.

## Language

### Households & people

**User**:
A person with a Hisaab account. Users own no financial data directly; everything they record belongs to a Household.
_Avoid_: Account (reserved for money), customer

**Household**:
The group that owns financial data: wallets, entries, categories and budgets. Every piece of financial data belongs to exactly one Household.
_Avoid_: Tenant, family, group, organization

**Personal household**:
The single-member Household created automatically for every User, holding their private money. Presented in the UI as "Personal", not as a household.
_Avoid_: Personal space, personal wallet (as an ownership concept)

**Membership**:
A User's belonging to a Household, carrying their Role there.
_Avoid_: User-household, link

**Role**:
What a Member may do within one Household: **Admin** (manages members, invites and the household itself) or **Member** (records and views). Roles exist only within a Household; there is no platform-wide role.
_Avoid_: User (as a role name), super-admin, owner

**Member**:
A User holding a Membership in a given Household.

**Former member**:
How entries are attributed after their author has deleted their account. Entries remain in the Household.

**Invite**:
A link created by a Household Admin that lets someone join that Household with a preset Role. It expires and can be revoked, and may be tied to one email address.
_Avoid_: Invite code, join code
