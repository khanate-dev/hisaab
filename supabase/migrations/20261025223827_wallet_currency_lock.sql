-- A Wallet's currency is fixed once it has Entries: its amounts are in that currency (CONTEXT.md, Wallet). Expand-only.

create function private.lock_wallet_currency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.currency is distinct from old.currency and exists (select 1 from public.entries where wallet_id = new.id) then
		raise exception 'A Wallet''s currency is fixed once it has Entries' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.lock_wallet_currency() from public;

create trigger lock_wallet_currency
	before update of currency on public.wallets
	for each row execute function private.lock_wallet_currency();

-- An Entry being recorded holds its Wallet row, so a concurrent currency change waits for it (as for the Base currency).
create or replace function private.hold_household_for_entry() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform 1 from public.households where id = new.household_id for share;
	perform 1 from public.wallets where id = new.wallet_id for share;
	return new;
end;
$$;

-- An Entry moved to another Wallet holds that Wallet too, so the move and a currency change can't pass each other.
drop trigger hold_household_for_entry on public.entries;
create trigger hold_household_for_entry
	before insert or update of household_id, wallet_id on public.entries
	for each row execute function private.hold_household_for_entry();
