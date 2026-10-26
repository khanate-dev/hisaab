-- Transfers (spec §3.2): one Entry moving money between two Wallets of the same household. `wallet_id` is the Wallet
-- it leaves (amount: minus what leaves it) and `to_wallet_id` the one it arrives in (to_amount: what arrives, in that
-- Wallet's currency; the same as what left when the currencies match). Expand-only: the kind check is widened,
-- columns are added nullable, and new rules only constrain Transfers.

alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
	check (kind in ('balance_adjustment', 'expense', 'income', 'transfer'));

alter table public.entries
	add column to_wallet_id uuid,
	add column to_amount numeric;
alter table public.entries add constraint entries_to_wallet_id_household_id_fkey
	foreign key (to_wallet_id, household_id) references public.wallets (id, household_id);
create index entries_to_wallet_id_idx on public.entries (to_wallet_id);

-- A Transfer leaves one Wallet for another, with no Category; nothing else has a second Wallet.
alter table public.entries drop constraint entries_kind_shape;
alter table public.entries add constraint entries_kind_shape check (
	(kind = 'balance_adjustment' and category_id is null and to_wallet_id is null and to_amount is null)
	or (kind = 'expense' and category_id is not null and amount < 0 and to_wallet_id is null and to_amount is null)
	or (kind = 'income' and category_id is not null and amount > 0 and to_wallet_id is null and to_amount is null)
	or (kind = 'transfer' and category_id is null and amount < 0 and to_amount > 0
		and to_wallet_id is not null and to_wallet_id <> wallet_id)
);

-- Between Wallets of one currency, what arrives is what left, so a Transfer moves money without making or losing any.
-- Both Wallets are looked up in the Entry's own household only; anything elsewhere is left to the foreign keys.
create function private.keep_transfer_whole() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	from_currency text;
	to_currency text;
begin
	if new.kind is distinct from 'transfer' then
		return new;
	end if;
	select currency into from_currency from public.wallets where id = new.wallet_id and household_id = new.household_id;
	select currency into to_currency from public.wallets where id = new.to_wallet_id and household_id = new.household_id;
	if from_currency = to_currency and new.to_amount <> -new.amount then
		raise exception 'Between Wallets of one currency, a Transfer arrives with what left' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_transfer_whole() from public;
create trigger keep_transfer_whole
	before insert or update of kind, amount, to_amount, wallet_id, to_wallet_id on public.entries
	for each row execute function private.keep_transfer_whole();

-- A Wallet's currency is fixed once any Entry touches it, as the Wallet it leaves or arrives in.
create or replace function private.lock_wallet_currency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.currency is distinct from old.currency
		and exists (select 1 from public.entries where wallet_id = new.id or to_wallet_id = new.id) then
		raise exception 'A Wallet''s currency is fixed once it has Entries' using errcode = '23514';
	end if;
	return new;
end;
$$;

-- An Entry being recorded or moved holds both its Wallets, so a concurrent currency change waits for it.
create or replace function private.hold_household_for_entry() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform 1 from public.households where id = new.household_id for share;
	perform 1 from public.wallets where id = new.wallet_id for share;
	if new.to_wallet_id is not null then
		perform 1 from public.wallets where id = new.to_wallet_id for share;
	end if;
	return new;
end;
$$;
drop trigger hold_household_for_entry on public.entries;
create trigger hold_household_for_entry
	before insert or update of household_id, wallet_id, to_wallet_id on public.entries
	for each row execute function private.hold_household_for_entry();

-- Admins and Members delete any Entry now (CONTEXT.md, Role), Transfers and Balance adjustments included.
drop policy "Admins and Members delete Expenses and Incomes" on public.entries;
create policy "Admins and Members delete Entries" on public.entries
	for delete to authenticated using (private.can_write(household_id));
