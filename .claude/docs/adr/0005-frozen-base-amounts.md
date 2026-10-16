# Entries store a frozen Base amount; the Base currency is locked

Every Entry in a Wallet whose currency differs from the Household's Base currency also stores a **Base amount**: its value in the Base currency. The amount is fixed when the Entry is recorded and can be edited by the user. Budgets and money-flow reports (spending, income vs expense, trends) add up Base amounts, so a past month's figures never shift when exchange rates move. They also need no network connection, because the conversion already happened when the Entry was recorded. Balances and net worth are different: they show current value, so they convert at the latest rate instead.

We rejected two alternatives. Live conversion at view time rewrites history every time rates move, and it fails offline when no rate is cached. Per-currency reports with no conversion make Budgets and net worth meaningless in households that mix currencies.

The Base amount is pre-filled from the market rate on the Entry's date, so the rate provider must offer historical daily rates that include PKR. When a device is offline and has no rate cached for that date, it uses the latest cached rate and flags the Entry "rate estimated". On the next sync the Entry is corrected silently, unless the user has edited the Base amount. There are no household-set rates: the gap between the official rate and the rate the household actually got is handled by editing that Entry's Base amount. A cross-currency Transfer stores the real amount on each side.

Because every Base amount is denominated in the Base currency, the **Base currency is locked once the Household has any Entry**. Changing it would mean re-converting all of history and losing users' manual edits. A household that really changes currency starts a new Household.

Decided in [Supporting features](https://github.com/khanate-dev/hisaab/issues/10).
