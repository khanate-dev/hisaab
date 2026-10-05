# Wallet balances are derived, never stored

A Wallet's Balance is computed from its Entries: the opening Balance adjustment plus every Entry touching the wallet. It is never a stored column. We chose this over the old schema's stored `wallets.balance` because Hisaab is offline-first and multi-device. Two devices offline would each write `balance = old − x`, and on sync one write would win and an Entry would silently drop out of the balance. Summed Entries merge without conflict and always explain every rupee. Any cached balance is a disposable cache, never the source of truth. Mismatches with reality are fixed with a Balance adjustment Entry, never by editing a balance. Loan outstanding amounts are derived the same way: principal minus Repayments.

Amounts are exact decimals in the actual unit (not minor units, never floating point), and each Wallet has an ISO 4217 currency. JavaScript and SQLite have no native decimal type, and SQLite `NUMERIC` stores numbers as floating point. So amounts travel as strings, use a decimal library in TypeScript, and are stored as Postgres `numeric` or SQLite `TEXT`.

Decided in [Core money model](https://github.com/khanate-dev/hisaab/issues/5).
