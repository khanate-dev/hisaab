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
The anonymous stand-in, without a name or email, that replaces a User in a Household once they delete their account. Their Entries and Activity log stay attributed to it. Each deleted User gets a separate one per Household ("Former member 1", "Former member 2").

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
A Household's default currency for new Wallets, and the currency its Budgets and reports are in. It is fixed once the Household has any Entry.

**Base amount**:
An Entry's value in the Household's Base currency. It is fixed when the Entry is recorded in a non-base Wallet, and editable. Budgets and reports of money flow add up Base amounts. Balances and net worth convert at the latest rate instead.
_Avoid_: Converted amount, home amount

**Entry**:
Any record that changes a Wallet's Balance: Expense, Income, Transfer, Loan principal, Repayment or Balance adjustment.
_Avoid_: Transaction, movement, record

**Expense**:
An Entry for money leaving a Wallet, with a date, a description and a Category, optionally broken into Items.
_Avoid_: Spend, payment, purchase

**Income**:
An Entry for money arriving in a Wallet, with a date, a description and a Category. Never itemized.
_Avoid_: Earning, receipt

**Item**:
One line of an Expense: a description, an amount and an optional informational quantity, optionally in its own Category. Once an Expense has Items, its total is their sum.
_Avoid_: Line item, split

**Attachment**:
An image or PDF kept on an Entry as evidence, such as a receipt, bill, transfer screenshot or loan agreement. An Entry has at most five.
_Avoid_: Receipt (as the general term), file, document

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

### Categories & budgets

**Category**:
A household's label for Expenses or Incomes, which are two separate lists. It has an icon and a colour, and can be archived but not deleted while in use.
_Avoid_: Tag, label, bucket

**Subcategory**:
A Category under a parent Category, one level deep only. A parent's totals include its Subcategories.

**Budget month**:
A Household's monthly period, starting on the household-chosen day (the 1st by default).
_Avoid_: Calendar month (when the start day differs), cycle

**Budget**:
A standing amount per Budget month for an expense Category, valid from a given month onward until changed.
_Avoid_: Limit, allowance

**Budget override**:
A replacement Budget amount for one specific Budget month.

**Expected income**:
A Budget for an income Category: how much income is expected per Budget month.
_Avoid_: Income budget

### Recurring

**Recurring rule**:
A template Entry plus a schedule that produces Occurrences. Each rule is either **Auto-record** (an Occurrence becomes an Entry on its due date) or **Confirm** (the default: an Occurrence waits as Pending).
_Avoid_: Subscription, scheduled transaction, repeat

**Occurrence**:
One due instance of a Recurring rule, identified by the rule plus its due date.

**Pending**:
The state of an Occurrence awaiting confirmation, edit, skip or snooze. A Pending Occurrence affects no Balance or Budget.
_Avoid_: Draft, unconfirmed entry

### Reports & notifications

**Pace**:
How much of a Budget is used compared with how far through the Budget month we are (e.g. "day 12 of 30, 58% spent").

**My overview**:
A User's own combined view of net worth and income vs expense across every Household they belong to. Cross-household transfers cancel out. Shown in the User's own display currency, converted at the latest rates, so it is approximate when currencies mix. Seen only by that User.
_Avoid_: Global dashboard, all-households report

**Notification**:
A notice raised by a trigger (recurring due, auto-recorded, budget threshold, loan due, activity digest, membership, monthly summary) for chosen recipients in a Household.
_Avoid_: Alert, reminder (as separate concepts)

**Notification inbox**:
The in-app list that always receives every Notification for a User, whatever other delivery channels are on.

### Data

**Spreadsheet export**:
A CSV of a Household's Entries, filtered by date range and the usual filters, for use outside the app. Admins only.

**Full backup**:
A complete copy of one Household (every record plus Attachment files) that can be imported into a new Household to restore or move it. Admins only.
_Avoid_: Export (unqualified), dump

**CSV import**:
Loading rows from a statement or another app into one Wallet as ordinary Entries, with columns mapped by the user and likely duplicates flagged before confirming.

**Saved filter**:
A named set of search and filter criteria over a Household's Entries, private to the User who saved it.
_Avoid_: View, smart list
