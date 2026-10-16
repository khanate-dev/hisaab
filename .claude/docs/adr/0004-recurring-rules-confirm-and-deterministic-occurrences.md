# Recurring rules default to confirm, and occurrences have deterministic identity

Recurring Entries don't post silently by default. Most real recurring bills vary (utilities, school fees with extras), so a Recurring rule defaults to **Confirm**: each due Occurrence waits as Pending, affecting no Balance or Budget until a Member confirms, edits, skips or snoozes it. **Auto-record** is an opt-in mode for fixed amounts (rent, subscriptions, salary). Editing a rule changes only future Occurrences; Entries already produced are never rewritten.

Because Hisaab is offline-first and multi-device, two offline devices could both generate the same month's rent. So an Occurrence's identity is **deterministic, derived from the rule id plus the due date** (e.g. a name-based UUID), never randomly minted. Two devices that generate the same Occurrence produce the same id, and the copies merge on sync instead of duplicating.

Decided in [Income & expense tracking](https://github.com/khanate-dev/hisaab/issues/6).
