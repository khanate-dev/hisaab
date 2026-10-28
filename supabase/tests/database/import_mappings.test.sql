-- Import mappings: an Admin keeps one per Wallet, of the household's own Wallets; Members, Viewers and outsiders
-- neither see nor save them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000eba1', 'admin@example.com'),
	('00000000-0000-4000-8000-00000000eba2', 'member@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-00000000ebf1', 'Family'),
	('00000000-0000-7000-8000-00000000ebf2', 'Other');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000ebe1', '00000000-0000-7000-8000-00000000ebf1', '00000000-0000-4000-8000-00000000eba1', 'admin'),
	('00000000-0000-7000-8000-00000000ebe2', '00000000-0000-7000-8000-00000000ebf1', '00000000-0000-4000-8000-00000000eba2', 'member');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000ebc1', '00000000-0000-7000-8000-00000000ebf1', 'HBL', 'bank', 'PKR'),
	('00000000-0000-7000-8000-00000000ebc2', '00000000-0000-7000-8000-00000000ebf2', 'Theirs', 'bank', 'PKR');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000eba1');
select lives_ok(
	$$ insert into public.import_mappings (id, household_id, wallet_id, mapping)
	   values ('00000000-0000-7000-8000-00000000eb01', '00000000-0000-7000-8000-00000000ebf1',
	           '00000000-0000-7000-8000-00000000ebc1', '{"dateColumn": 0}') $$,
	'an Admin saves a Wallet''s mapping'
);
select throws_ok(
	$$ insert into public.import_mappings (id, household_id, wallet_id, mapping)
	   values ('00000000-0000-7000-8000-00000000eb02', '00000000-0000-7000-8000-00000000ebf1',
	           '00000000-0000-7000-8000-00000000ebc1', '{}') $$,
	'23505', null, 'one per Wallet'
);
select throws_ok(
	$$ insert into public.import_mappings (id, household_id, wallet_id, mapping)
	   values ('00000000-0000-7000-8000-00000000eb03', '00000000-0000-7000-8000-00000000ebf1',
	           '00000000-0000-7000-8000-00000000ebc2', '{}') $$,
	'23503', null, 'for one of the household''s own Wallets'
);
select throws_ok(
	$$ update public.import_mappings set mapping = '[1]' where id = '00000000-0000-7000-8000-00000000eb01' $$,
	'23514', null, 'holding an object'
);
select throws_ok(
	$$ update public.import_mappings set wallet_id = '00000000-0000-7000-8000-00000000ebc2'
	   where id = '00000000-0000-7000-8000-00000000eb01' $$,
	'42501', null, 'and staying its Wallet''s'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000eba2');
select is((select count(*)::int from public.import_mappings), 0, 'a Member sees none');
select throws_ok(
	$$ insert into public.import_mappings (id, household_id, wallet_id, mapping)
	   values ('00000000-0000-7000-8000-00000000eb04', '00000000-0000-7000-8000-00000000ebf1',
	           '00000000-0000-7000-8000-00000000ebc1', '{}') $$,
	'42501', null, 'nor saves one: CSV import is the Admins'''
);

select * from finish();
rollback;
