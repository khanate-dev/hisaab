-- A Loan is in one currency, its principal's Wallet's (#119): a Loan can be in any currency, and its Repayments go only
-- to or from Wallets in it, however they arrive.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000077a1', 'member@example.com');
insert into public.households (id, name, base_currency) values ('00000000-0000-7000-8000-0000000077f1', 'Family', 'PKR');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000077e1', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-4000-8000-0000000077a1', 'member');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000077c1', '00000000-0000-7000-8000-0000000077f1', 'Cash', 'cash', 'PKR'),
	('00000000-0000-7000-8000-0000000077c2', '00000000-0000-7000-8000-0000000077f1', 'Dollars', 'cash', 'USD'),
	('00000000-0000-7000-8000-0000000077c3', '00000000-0000-7000-8000-0000000077f1', 'More dollars', 'bank', 'USD');
insert into public.contacts (id, household_id, name) values
	('00000000-0000-7000-8000-0000000077d1', '00000000-0000-7000-8000-0000000077f1', 'Ali');
insert into public.loans (id, household_id, contact_id, direction) values
	('00000000-0000-7000-8000-0000000077b1', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-0000000077d1', 'lent');

select lives_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by) values
	   ('00000000-0000-7000-8000-000000007701', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-0000000077c2',
	    'loan_principal', -100, '00000000-0000-7000-8000-0000000077b1', '2026-11-01', '00000000-0000-4000-8000-0000000077a1') $$,
	'a Loan Lent from a Wallet in another currency than the Base one'
);
select lives_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by) values
	   ('00000000-0000-7000-8000-000000007702', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-0000000077c3',
	    'repayment', 40, '00000000-0000-7000-8000-0000000077b1', '2026-11-02', '00000000-0000-4000-8000-0000000077a1') $$,
	'repaid into another Wallet in its currency'
);
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by) values
	   ('00000000-0000-7000-8000-000000007703', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-0000000077c1',
	    'repayment', 10, '00000000-0000-7000-8000-0000000077b1', '2026-11-03', '00000000-0000-4000-8000-0000000077a1') $$,
	'23514', null, 'but never into one in another currency'
);
select throws_ok(
	$$ update public.entries set wallet_id = '00000000-0000-7000-8000-0000000077c1'
	   where id = '00000000-0000-7000-8000-000000007702' $$,
	'23514', null, 'nor moved into one'
);

select * from finish();
rollback;
