-- Transfers (spec §3.2): one Entry from one Wallet to another of the same household, arriving with what left when
-- the currencies match; both Wallets' currencies lock; Admins and Members delete any Entry, Viewers can't.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000005a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000005b1', 'viewer@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-0000000005f1', 'Family'),
	('00000000-0000-7000-8000-0000000005f2', 'Elsewhere');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000005e1', '00000000-0000-7000-8000-0000000005f1', '00000000-0000-4000-8000-0000000005a1', 'member'),
	('00000000-0000-7000-8000-0000000005e2', '00000000-0000-7000-8000-0000000005f1', '00000000-0000-4000-8000-0000000005b1', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000005c1', '00000000-0000-7000-8000-0000000005f1', 'Cash', 'cash', 'PKR'),
	('00000000-0000-7000-8000-0000000005c2', '00000000-0000-7000-8000-0000000005f1', 'HBL', 'bank', 'PKR'),
	('00000000-0000-7000-8000-0000000005c3', '00000000-0000-7000-8000-0000000005f1', 'Dollars', 'bank', 'USD'),
	('00000000-0000-7000-8000-0000000005c4', '00000000-0000-7000-8000-0000000005f2', 'Theirs', 'cash', 'PKR');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.affected(statement text) returns int language plpgsql as $$
declare n int;
begin
	execute statement;
	get diagnostics n = row_count;
	return n;
end $$;
create function pg_temp.transfer(id text, from_wallet text, to_wallet text, amount numeric, to_amount numeric) returns text
language sql as $$
	select format(
		$q$ insert into public.entries (id, household_id, wallet_id, to_wallet_id, kind, amount, to_amount, occurred_on, created_by)
		    values (%L, '00000000-0000-7000-8000-0000000005f1', %L, %L, 'transfer', %s, %s, '2026-10-26',
		            '00000000-0000-4000-8000-0000000005a1') $q$,
		id, from_wallet, to_wallet, amount, to_amount);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000005a1');
select lives_ok(
	pg_temp.transfer('00000000-0000-7000-8000-0000000005d1', '00000000-0000-7000-8000-0000000005c1',
		'00000000-0000-7000-8000-0000000005c2', -5000, 5000),
	'a Member moves money from Cash to the bank'
);
select lives_ok(
	pg_temp.transfer('00000000-0000-7000-8000-0000000005d2', '00000000-0000-7000-8000-0000000005c2',
		'00000000-0000-7000-8000-0000000005c3', -28000, 100),
	'a Transfer between currencies arrives with its own amount'
);
select throws_ok(
	pg_temp.transfer('00000000-0000-7000-8000-0000000005d3', '00000000-0000-7000-8000-0000000005c1',
		'00000000-0000-7000-8000-0000000005c2', -5000, 4000),
	'23514', null, 'between Wallets of one currency, a Transfer arrives with what left'
);
select throws_ok(
	pg_temp.transfer('00000000-0000-7000-8000-0000000005d4', '00000000-0000-7000-8000-0000000005c1',
		'00000000-0000-7000-8000-0000000005c1', -10, 10),
	'23514', null, 'a Transfer goes to another Wallet'
);
select throws_ok(
	pg_temp.transfer('00000000-0000-7000-8000-0000000005d5', '00000000-0000-7000-8000-0000000005c1',
		'00000000-0000-7000-8000-0000000005c4', -10, 10),
	'23503', null, 'a Transfer stays within its household'
);
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
	   values ('00000000-0000-7000-8000-0000000005d6', '00000000-0000-7000-8000-0000000005f1',
	           '00000000-0000-7000-8000-0000000005c1', 'transfer', -10, '2026-10-26', '00000000-0000-4000-8000-0000000005a1') $$,
	'23514', null, 'a Transfer has a Wallet it arrives in'
);
select throws_ok(
	$$ update public.wallets set currency = 'EUR' where id = '00000000-0000-7000-8000-0000000005c3' $$,
	'23514', null, 'a Wallet a Transfer arrives in has its currency fixed'
);
select is(pg_temp.affected($$ update public.entries set amount = -6000, to_amount = 6000 where id = '00000000-0000-7000-8000-0000000005d1' $$), 1,
	'a Member edits a Transfer');
select lives_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
	   values ('00000000-0000-7000-8000-0000000005d7', '00000000-0000-7000-8000-0000000005f1',
	           '00000000-0000-7000-8000-0000000005c1', 'balance_adjustment', -250, '2026-10-26', '00000000-0000-4000-8000-0000000005a1') $$,
	'a Member records a Balance adjustment'
);

-- Deleting. (Former members join with account deletion, #64.)
select pg_temp.act_as('00000000-0000-4000-8000-0000000005b1');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000005d1' $$), 0,
	'a Viewer can''t delete a Transfer');
select pg_temp.act_as('00000000-0000-4000-8000-0000000005a1');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000005d1' $$), 1,
	'a Member deletes a Transfer');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000005d7' $$), 1,
	'a Member deletes a Balance adjustment');
select set_config('role', 'anon', true);
select throws_ok($$ delete from public.entries $$, '42501', null, 'anon cannot delete Entries');

select * from finish();
rollback;
