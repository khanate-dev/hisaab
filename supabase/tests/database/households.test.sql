-- Sign-up creates the Personal household and Admin Membership; RLS lets Members read only their own households.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- Users: alice, bob and dan share a household (alice Admin, bob Viewer, dan Member); carol is on her own.
insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000000a', 'alice@example.com'),
	('00000000-0000-4000-8000-00000000000b', 'bob@example.com'),
	('00000000-0000-4000-8000-00000000000c', 'carol@example.com'),
	('00000000-0000-4000-8000-00000000000d', 'dan@example.com');

-- Sign-up trigger
select is(
	(select count(*)::int from public.households where personal_user_id = '00000000-0000-4000-8000-00000000000a'),
	1,
	'sign-up creates exactly one Personal household'
);
select is(
	(select name from public.households where personal_user_id = '00000000-0000-4000-8000-00000000000a'),
	'Personal',
	'the Personal household is named Personal'
);
select results_eq(
	$$
		select m.role from public.memberships m
		join public.households h on h.id = m.household_id
		where h.personal_user_id = '00000000-0000-4000-8000-00000000000a'
	$$,
	$$ values ('admin') $$,
	'the new User is the only Member of their Personal household, as Admin'
);
select ok(
	(select bool_and(substring(h.id::text, 15, 1) = '7' and substring(m.id::text, 15, 1) = '7')
		from public.households h join public.memberships m on m.household_id = h.id),
	'household and membership ids are UUIDv7'
);
select is(
	(select count(*)::int from public.memberships m
		join public.households h on h.id = m.household_id
		where h.personal_user_id is not null and m.user_id <> h.personal_user_id),
	0,
	'no one else is a Member of a Personal household'
);

insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000000f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000a', 'admin'),
	('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000b', 'viewer'),
	('00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000d', 'member');

-- Acting as a signed-in User
create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select results_eq(
	$$ select name from public.households order by name $$,
	$$ values ('Family'), ('Personal') $$,
	'alice reads her Personal household and the shared one'
);
select is(
	(select count(*)::int from public.memberships),
	4,
	'alice reads her own Membership plus every Membership of the shared household'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select results_eq(
	$$ select name from public.households order by name $$,
	$$ values ('Family'), ('Personal') $$,
	'a Viewer reads the shared household and their own Personal one'
);
select is(
	(select count(*)::int from public.households where personal_user_id = '00000000-0000-4000-8000-00000000000a'),
	0,
	'bob cannot read alice''s Personal household'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000000d');
select results_eq(
	$$ select name from public.households order by name $$,
	$$ values ('Family'), ('Personal') $$,
	'a Member reads the shared household and their own Personal one'
);
select is(
	(select count(*)::int from public.memberships where household_id = '00000000-0000-7000-8000-0000000000f1'),
	3,
	'a Member reads every Membership of the shared household'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
select results_eq(
	$$ select name from public.households $$,
	$$ values ('Personal') $$,
	'carol reads only her Personal household'
);
select results_eq(
	$$ select user_id from public.memberships $$,
	$$ values ('00000000-0000-4000-8000-00000000000c'::uuid) $$,
	'carol reads only her own Membership'
);

-- A User creates households only as their founder (shared_households.test.sql) and joins only by Invite.
select throws_ok(
	$$ insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000000f2', 'Sneaky') $$,
	'42501',
	null,
	'a User cannot create a household directly'
);
select throws_ok(
	$$ insert into public.memberships (id, household_id, user_id, role)
		values ('00000000-0000-7000-8000-0000000000a4', '00000000-0000-7000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000c', 'admin') $$,
	'42501',
	null,
	'a User cannot add themselves to a household'
);
select throws_ok(
	$$ update public.memberships set role = 'viewer' where user_id = '00000000-0000-4000-8000-00000000000c' $$,
	'42501',
	null,
	'a User cannot change a Role'
);

reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.households $$, '42501', null, 'anon cannot read households');
select throws_ok($$ select * from public.memberships $$, '42501', null, 'anon cannot read memberships');

select * from finish();
rollback;
