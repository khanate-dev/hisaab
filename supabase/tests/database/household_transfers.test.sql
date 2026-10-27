-- Cross-household transfers: a User in two households records mirrored halves, one in each; each household reads only
-- its own; only that User changes a half, and a half keeps its kind and direction; nobody restores one half alone.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000cca1', 'both@example.com'),
	('00000000-0000-4000-8000-00000000cca2', 'partner@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-00000000ccf1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000cce1', '00000000-0000-7000-8000-00000000ccf1', '00000000-0000-4000-8000-00000000cca1', 'member'),
	('00000000-0000-7000-8000-00000000cce2', '00000000-0000-7000-8000-00000000ccf1', '00000000-0000-4000-8000-00000000cca2', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000ccc1',
	 (select id from public.households where personal_user_id = '00000000-0000-4000-8000-00000000cca1'), 'Salary', 'bank', 'PKR'),
	('00000000-0000-7000-8000-00000000ccc2', '00000000-0000-7000-8000-00000000ccf1', 'Joint', 'bank', 'PKR');

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
-- A half: its id, household (Personal when null), Wallet, signed amount and link.
create function pg_temp.half(id text, household text, wallet text, amount numeric, link text) returns text
language sql as $$
	select format(
		$q$ insert into public.entries (id, household_id, wallet_id, kind, amount, link_id, occurred_on, created_by)
		    values (%L, coalesce(%L::uuid, (select id from public.households
		            where personal_user_id = '00000000-0000-4000-8000-00000000cca1')),
		            %L, 'household_transfer', %s, %L, '2026-10-27', '00000000-0000-4000-8000-00000000cca1') $q$,
		id, household, wallet, amount, link);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000cca1');
select lives_ok(pg_temp.half('00000000-0000-7000-8000-00000000ccd1', null, '00000000-0000-7000-8000-00000000ccc1', -5000,
	'00000000-0000-7000-8000-00000000cc01'), 'money leaves the Personal Wallet');
select lives_ok(pg_temp.half('00000000-0000-7000-8000-00000000ccd2', '00000000-0000-7000-8000-00000000ccf1',
	'00000000-0000-7000-8000-00000000ccc2', 5000, '00000000-0000-7000-8000-00000000cc01'), 'and arrives in the shared one');
select throws_ok(pg_temp.half('00000000-0000-7000-8000-00000000ccd3', '00000000-0000-7000-8000-00000000ccf1',
	'00000000-0000-7000-8000-00000000ccc2', 10, '00000000-0000-7000-8000-00000000cc01'),
	'23505', null, 'a household has one half of a pair');
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, link_id, occurred_on, created_by)
	   values ('00000000-0000-7000-8000-00000000ccd4', '00000000-0000-7000-8000-00000000ccf1',
	           '00000000-0000-7000-8000-00000000ccc2', 'balance_adjustment', 10, '00000000-0000-7000-8000-00000000cc09', '2026-10-27',
	           '00000000-0000-4000-8000-00000000cca1') $$,
	'23514', null, 'only a half carries a link');
select throws_ok(
	$$ update public.entries set amount = 100 where id = '00000000-0000-7000-8000-00000000ccd1' $$,
	'23514', null, 'and stays the same way round');
select is(pg_temp.affected($$ update public.entries set amount = -6000 where id = '00000000-0000-7000-8000-00000000ccd1' $$),
	1, 'its maker changes how much');

select pg_temp.act_as('00000000-0000-4000-8000-00000000cca2');
select is((select count(*)::int from public.entries where link_id = '00000000-0000-7000-8000-00000000cc01'), 1,
	'the shared household sees only its own half');
select throws_ok($$ update public.entries set notes = 'x' where id = '00000000-0000-7000-8000-00000000ccd2' $$,
	'42501', null, 'another Member can''t change it');
select throws_ok($$ delete from public.entries where id = '00000000-0000-7000-8000-00000000ccd2' $$,
	'42501', null, 'nor delete it');

-- Once its maker leaves the household, the half is the household's.
reset role;
delete from public.memberships where id = '00000000-0000-7000-8000-00000000cce1';
select pg_temp.act_as('00000000-0000-4000-8000-00000000cca2');
select is(pg_temp.affected($$ update public.entries set notes = 'Thanks' where id = '00000000-0000-7000-8000-00000000ccd2' $$),
	1, 'once its maker has left, the household edits its half');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-00000000ccd2' $$),
	1, 'and deletes it');
select lives_ok($$ select public.restore_entry('00000000-0000-7000-8000-00000000ccd2') $$,
	'and, its link broken, restores it like any Entry');

reset role;
select is((select count(*)::int from public.entries where link_id is not null
	and id in ('00000000-0000-7000-8000-00000000ccd1', '00000000-0000-7000-8000-00000000ccd2')), 0,
	'the maker leaving broke the link on both halves');
select is((select amount from public.entries where id = '00000000-0000-7000-8000-00000000ccd1'), -6000::numeric,
	'and left the Personal half as it was');

-- A linked half isn't restored on its own.
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000cce3', '00000000-0000-7000-8000-00000000ccf1', '00000000-0000-4000-8000-00000000cca1', 'member');
select pg_temp.act_as('00000000-0000-4000-8000-00000000cca1');
select lives_ok(pg_temp.half('00000000-0000-7000-8000-00000000ccd5', '00000000-0000-7000-8000-00000000ccf1',
	'00000000-0000-7000-8000-00000000ccc2', 70, '00000000-0000-7000-8000-00000000cc02'), 'a new pair''s half');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-00000000ccd5' $$), 1,
	'deleted by its maker');
select throws_ok($$ select public.restore_entry('00000000-0000-7000-8000-00000000ccd5') $$,
	'23514', null, 'can''t come back on its own');

select * from finish();
rollback;
