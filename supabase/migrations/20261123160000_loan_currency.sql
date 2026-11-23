-- A Loan is in one currency, its principal's Wallet's (#119): its Repayments go only to or from Wallets in that
-- currency, so what's outstanding is always one sum in one currency. The app offers only those Wallets; the database
-- holds to it whatever arrives. (A Wallet's currency is fixed once it has Entries, so the Loan's can't drift.)
-- Expand-only: a function and a trigger; every Loan so far is in the Base currency, so none is out of step.
create function private.keep_loan_currency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	wanted text;
	given text;
begin
	if new.loan_id is null then
		return new;
	end if;
	select w.currency into wanted
	from public.entries e join public.wallets w on w.id = e.wallet_id
	where e.loan_id = new.loan_id and e.household_id = new.household_id and e.id <> new.id
	limit 1;
	if not found then
		return new;
	end if;
	select currency into given from public.wallets where id = new.wallet_id;
	if given is distinct from wanted then
		raise exception 'A Loan''s Repayments are in its own currency, %', wanted using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_loan_currency() from public;
create trigger keep_loan_currency
	before insert or update of wallet_id, loan_id on public.entries
	for each row execute function private.keep_loan_currency();
