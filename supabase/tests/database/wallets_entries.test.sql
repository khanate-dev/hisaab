-- Profiles, Wallets, Entries and the Base currency (ADR-0001, ADR-0002, ADR-0005).
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000000a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000000b1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000000c1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000000d1', 'outsider@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000000f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'admin'),
	('00000000-0000-7000-8000-0000000000e2', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1', 'member'),
	('00000000-0000-7000-8000-0000000000e3', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'viewer');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
-- Counted past RLS, so checks see what actually landed.
create function pg_temp.wallet_count() returns int language sql security definer as $$
	select count(*)::int from public.wallets where household_id = '00000000-0000-7000-8000-0000000000f1';
$$;

-- Profiles
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select lives_ok(
	$$ insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-0000000000b1', 'Bilal') $$,
	'a User creates their own profile'
);
select throws_ok(
	$$ insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'Not me') $$,
	'42501', null, 'a User cannot create someone else''s profile'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select results_eq(
	$$ select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b1' $$,
	$$ values ('Bilal') $$,
	'a fellow Member reads the profile'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is_empty($$ select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000b1' $$,
	'an outsider cannot read the profile');

-- Base currency: set by an Admin while the household has no Entry
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
	$$ update public.households set base_currency = 'PKR' where id = '00000000-0000-7000-8000-0000000000f1' $$,
	'an Admin sets the Base currency before any Entry'
);
select throws_ok(
	$$ update public.households set base_currency = 'pkr' where id = '00000000-0000-7000-8000-0000000000f1' $$,
	'23514', null, 'the Base currency is an ISO 4217 code'
);

-- Wallets
select lives_ok(
	$$ insert into public.wallets (id, household_id, name, type, currency)
		values ('00000000-0000-7000-8000-0000000000a9', '00000000-0000-7000-8000-0000000000f1', 'Cash', 'cash', 'PKR') $$,
	'an Admin adds a Wallet'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select lives_ok(
	$$ insert into public.wallets (id, household_id, name, type, currency)
		values ('00000000-0000-7000-8000-0000000000b9', '00000000-0000-7000-8000-0000000000f1', 'Bank', 'bank', 'PKR') $$,
	'a Member adds a Wallet'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok(
	$$ insert into public.wallets (id, household_id, name, type, currency)
		values ('00000000-0000-7000-8000-0000000000c9', '00000000-0000-7000-8000-0000000000f1', 'Mine', 'cash', 'PKR') $$,
	'42501', null, 'a Viewer cannot add a Wallet'
);
select results_eq($$ select name from public.wallets order by name $$, $$ values ('Bank'), ('Cash') $$, 'a Viewer reads the Wallets');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select throws_ok(
	$$ insert into public.wallets (id, household_id, name, type, currency)
		values ('00000000-0000-7000-8000-0000000000d9', '00000000-0000-7000-8000-0000000000f1', 'Sneaky', 'cash', 'PKR') $$,
	'42501', null, 'an outsider cannot add a Wallet'
);
select is_empty($$ select 1 from public.wallets $$, 'an outsider reads no Wallets');
select is(pg_temp.wallet_count(), 2, 'only the Admin''s and Member''s Wallets landed');

-- Entries
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select lives_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
		values ('00000000-0000-7000-8000-0000000000a8', '00000000-0000-7000-8000-0000000000f1',
			'00000000-0000-7000-8000-0000000000a9', 'balance_adjustment', 12345678901234.5678, '2026-10-26',
			'00000000-0000-4000-8000-0000000000b1') $$,
	'a Member records an opening Balance adjustment'
);
select is(
	(select amount::text from public.entries where id = '00000000-0000-7000-8000-0000000000a8'),
	'12345678901234.5678',
	'the amount is stored exactly'
);
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
		values ('00000000-0000-7000-8000-0000000000b8', '00000000-0000-7000-8000-0000000000f1',
			'00000000-0000-7000-8000-0000000000ff', 'balance_adjustment', 1, '2026-10-26',
			'00000000-0000-4000-8000-0000000000b1') $$,
	'23503', null, 'an Entry must point at a Wallet in its own household'
);
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
		values ('00000000-0000-7000-8000-0000000000c8', '00000000-0000-7000-8000-0000000000f1',
			'00000000-0000-7000-8000-0000000000a9', 'balance_adjustment', 1, '2026-10-26',
			'00000000-0000-4000-8000-0000000000a1') $$,
	'42501', null, 'an Entry is recorded as its own author'
);
select lives_ok(
	$$ update public.entries set amount = 500 where id = '00000000-0000-7000-8000-0000000000a8' $$,
	'a Member edits an Entry'
);
select throws_ok(
	$$ update public.entries set created_by = '00000000-0000-4000-8000-0000000000a1'
		where id = '00000000-0000-7000-8000-0000000000a8' $$,
	'42501', null, 'an Entry''s author cannot change'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
		values ('00000000-0000-7000-8000-0000000000d8', '00000000-0000-7000-8000-0000000000f1',
			'00000000-0000-7000-8000-0000000000a9', 'balance_adjustment', 1, '2026-10-26',
			'00000000-0000-4000-8000-0000000000c1') $$,
	'42501', null, 'a Viewer cannot record an Entry'
);

-- Base currency locks once the household has an Entry
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
	$$ update public.households set base_currency = 'USD' where id = '00000000-0000-7000-8000-0000000000f1' $$,
	'23514', null, 'the Base currency is fixed once the household has an Entry'
);

select * from finish();
rollback;
