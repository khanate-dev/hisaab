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
What a Member may do within one Household, one of three fixed levels: **Admin** (everything, plus members, invites, settings, export and deletion), **Member** (records and edits any Entry; manages Wallets, categories, budgets and Contacts) or **Viewer** (read-only). Roles exist only within a Household; there is no platform-wide role and no per-wallet permission.
_Avoid_: User (as a role name), super-admin, owner

**Member**:
A User holding a Membership in a given Household.

**Former member**:
How entries are attributed after their author has deleted their account. Entries remain in the Household.

**Invite**:
A link created by a Household Admin that lets someone join that Household with a preset Role. It expires and can be revoked, and may be tied to one email address.
_Avoid_: Invite code, join code

**Activity log**:
The append-only record of every change to a Household's data: who made it, when it happened on the device, when it synced, and the values before and after. Visible to all Members, editable by none. Deleted Entries can be restored from it.
_Avoid_: Logs, audit trail, history

### Money

**Wallet**:
A place where a Household's money sits, with one currency and a derived balance. It can be archived but never deleted while Entries reference it.
_Avoid_: Account

**Wallet type**:
The kind of a Wallet: **Cash**, **Bank**, **Mobile wallet** or **Credit card**. A Credit card is a liability, so its balance is normally negative (money owed).

**Balance**:
A Wallet's opening balance plus all Entries touching it. Always derived, never stored as the truth.

**Base currency**:
A Household's default currency for new Wallets.

**Entry**:
Any record that changes a Wallet's Balance: Expense, Income, Transfer, Loan principal, Repayment or Balance adjustment.
_Avoid_: Transaction, movement, record

**Transfer**:
An Entry moving money between two Wallets of the same Household.

**Cross-household transfer**:
A pair of linked, mirrored Entries, one in each of two Households, created in one action by a User who belongs to both. Each half is owned and seen only by its own Household.
_Avoid_: Contribution pair, shared transfer

**Balance adjustment**:
An Entry recording the gap between a Wallet's Balance and reality. It is not spending or income, so it is excluded from budgets and reports. The opening balance is a Wallet's first Balance adjustment.
_Avoid_: Correction, miscellaneous expense

**Contact**:
A person outside the app, kept in a Household's reusable list, who can be a Loan's counterparty. Not a User.
_Avoid_: Counterparty (as a stored name), friend, payee

**Loan**:
Money **Lent** to or **Borrowed** from a Contact. Its principal is an Entry, and it has an optional due date. Its outstanding amount is principal minus Repayments. It is **settled** when that reaches zero or the rest is written off.
_Avoid_: Debt, IOU

**Repayment**:
An Entry paying down part of a Loan, to or from any Wallet.
