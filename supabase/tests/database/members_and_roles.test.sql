-- Members and Roles: only Admins change Roles and remove Members; anyone leaves a shared household but its last
-- Admin, who also can't step down; nothing changes in a Personal household; an Admin deletes a shared household and
-- everything in it, its Activity log included.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000bba1', 'admin@example.com'),
	('00000000-0000-4000-8000-00000000bba2', 'member@example.com'),
	('00000000-0000-4000-8000-00000000bba3', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000bba4', 'outsider@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-00000000bbf1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000bbe1', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-4000-8000-00000000bba1', 'admin'),
	('00000000-0000-7000-8000-00000000bbe2', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-4000-8000-00000000bba2', 'member'),
	('00000000-0000-7000-8000-00000000bbe3', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-4000-8000-00000000bba3', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000bbc1', '00000000-0000-7000-8000-00000000bbf1', 'Cash', 'cash', 'PKR');

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
create function pg_temp.role_of(uid text) returns text language sql security definer as $$
	select role from public.memberships where household_id = '00000000-0000-7000-8000-00000000bbf1' and user_id = uid::uuid;
$$;

-- Roles.
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba2');
select is(pg_temp.affected($$ update public.memberships set role = 'admin' where id = '00000000-0000-7000-8000-00000000bbe3' $$),
	0, 'a Member can''t change someone''s Role');
select throws_ok($$ update public.memberships set role = 'admin' where id = '00000000-0000-7000-8000-00000000bbe2' $$,
	'42501', null, 'nor their own');
select is(pg_temp.affected($$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000bbe3' $$),
	0, 'nor remove anyone');
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba1');
select is(pg_temp.affected($$ update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-00000000bbe3' $$),
	1, 'an Admin changes a Viewer into a Member');
select throws_ok(
	$$ update public.memberships set default_wallet_id = '00000000-0000-7000-8000-00000000bbc1'
	   where id = '00000000-0000-7000-8000-00000000bbe2' $$,
	'42501', null, 'but picks nobody else''s default Wallet');
select throws_ok($$ update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-00000000bbe1' $$,
	'23514', null, 'the only Admin can''t step down');
select throws_ok(
	$$ update public.memberships set role = 'viewer'
	   where user_id = '00000000-0000-4000-8000-00000000bba1'
	     and household_id = (select id from public.households where personal_user_id = '00000000-0000-4000-8000-00000000bba1') $$,
	'42501', null, 'and no Role changes in a Personal household');
select is(pg_temp.affected($$ update public.memberships set role = 'admin' where id = '00000000-0000-7000-8000-00000000bbe2' $$),
	1, 'an Admin makes a Member an Admin');
select is(pg_temp.affected($$ update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-00000000bbe1' $$),
	1, 'and, no longer the only one, steps down');

-- Leaving and removing.
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba2');
select throws_ok($$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000bbe2' $$,
	'23514', null, 'the last Admin can''t leave');
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba1');
select is(pg_temp.affected($$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000bbe1' $$),
	1, 'a Member leaves');
select is(pg_temp.affected($$ delete from public.memberships
	where household_id = (select id from public.households where personal_user_id = '00000000-0000-4000-8000-00000000bba1') $$),
	0, 'but never their Personal household');
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba4');
select is(pg_temp.affected($$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000bbe3' $$),
	0, 'someone outside the household removes nobody from it');
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba2');
select is(pg_temp.affected($$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000bbe3' $$),
	1, 'an Admin removes a Member');
select is(pg_temp.role_of('00000000-0000-4000-8000-00000000bba3'), null, 'who no longer belongs');

-- Deleting the household, with money, a Loan, an Invite and its Activity log in it.
reset role;
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000bbe4', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-4000-8000-00000000bba3', 'member');
insert into public.contacts (id, household_id, name) values
	('00000000-0000-7000-8000-00000000bb11', '00000000-0000-7000-8000-00000000bbf1', 'Ali');
insert into public.loans (id, household_id, contact_id, direction) values
	('00000000-0000-7000-8000-00000000bb21', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-7000-8000-00000000bb11', 'lent');
insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-00000000bbd1', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-7000-8000-00000000bbc1',
	 'loan_principal', -100, '00000000-0000-7000-8000-00000000bb21', '2026-10-26', '00000000-0000-4000-8000-00000000bba2');
insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-00000000bbd2', '00000000-0000-7000-8000-00000000bbf1', '00000000-0000-7000-8000-00000000bbc1',
	 'expense', -50, (select id from public.categories where household_id = '00000000-0000-7000-8000-00000000bbf1' and name = 'Groceries'),
	 '2026-10-26', '00000000-0000-4000-8000-00000000bba2');
insert into public.invites (id, household_id, token, role, expires_at, created_by) values
	('00000000-0000-7000-8000-00000000bb31', '00000000-0000-7000-8000-00000000bbf1', repeat('k', 32), 'member',
	 now() + interval '1 day', '00000000-0000-4000-8000-00000000bba2');

select pg_temp.act_as('00000000-0000-4000-8000-00000000bba3');
select is(pg_temp.affected($$ delete from public.households where id = '00000000-0000-7000-8000-00000000bbf1' $$),
	0, 'a Member can''t delete the household');
select pg_temp.act_as('00000000-0000-4000-8000-00000000bba2');
select is(pg_temp.affected($$ delete from public.households
	where personal_user_id = '00000000-0000-4000-8000-00000000bba2' $$),
	0, 'nor an Admin their Personal household');
select is(pg_temp.affected($$ delete from public.households where id = '00000000-0000-7000-8000-00000000bbf1' $$),
	1, 'an Admin deletes a shared household');
reset role;
select is(
	(select count(*)::int from public.memberships where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.wallets where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.categories where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.entries where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.contacts where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.loans where household_id = '00000000-0000-7000-8000-00000000bbf1')
	+ (select count(*)::int from public.invites where household_id = '00000000-0000-7000-8000-00000000bbf1'),
	0, 'and everything in it goes'
);
select is((select count(*)::int from public.activity_log where household_id = '00000000-0000-7000-8000-00000000bbf1'),
	0, 'its Activity log included');

select * from finish();
rollback;
