-- Admins rename their households and delete shared ones; other Roles and outsiders change nothing.
-- RLS hides a rejected UPDATE/DELETE as "0 rows affected", which the upload connector treats as a rejection.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000000aa', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000000bb', 'member@example.com'),
	('00000000-0000-4000-8000-0000000000cc', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000000dd', 'outsider@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000000e1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000000b1', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 'admin'),
	('00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000bb', 'member'),
	('00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000cc', 'viewer');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.rename_family(new_name text) returns int language plpgsql as $$
declare affected int;
begin
	update public.households set name = new_name where id = '00000000-0000-7000-8000-0000000000e1';
	get diagnostics affected = row_count;
	return affected;
end $$;
-- Counted past RLS, so the check sees rows the acting User could no longer read.
create function pg_temp.family_membership_count() returns int language sql security definer as $$
	select count(*)::int from public.memberships where household_id = '00000000-0000-7000-8000-0000000000e1';
$$;
create function pg_temp.family_name() returns text language sql security definer as $$
	select name from public.households where id = '00000000-0000-7000-8000-0000000000e1';
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000bb');
select is(pg_temp.rename_family('By member'), 0, 'a Member cannot rename the household');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000cc');
select is(pg_temp.rename_family('By viewer'), 0, 'a Viewer cannot rename the household');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000dd');
select is(pg_temp.rename_family('By outsider'), 0, 'an outsider cannot rename the household');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000aa');
select is(pg_temp.rename_family('Home'), 1, 'an Admin renames the household');
select is(pg_temp.family_name(), 'Home', 'the new name is stored');
select lives_ok(
	$$ update public.households
		set name = 'Home', personal_user_id = personal_user_id, created_at = created_at
		where id = '00000000-0000-7000-8000-0000000000e1' $$,
	'a whole-row update that leaves the server-set columns alone succeeds'
);
select throws_ok(
	$$ update public.households set personal_user_id = '00000000-0000-4000-8000-0000000000aa'
		where id = '00000000-0000-7000-8000-0000000000e1' $$,
	'42501',
	null,
	'an Admin cannot turn a shared household into a Personal one'
);

select throws_ok(
	$$ update public.households set id = '00000000-0000-7000-8000-0000000000e9'
		where id = '00000000-0000-7000-8000-0000000000e1' $$,
	'42501',
	null,
	'an Admin cannot change a household''s id'
);

select is_empty(
	$$ delete from public.households where personal_user_id = '00000000-0000-4000-8000-0000000000aa' returning id $$,
	'an Admin cannot delete their Personal household'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000bb');
select is_empty(
	$$ delete from public.households where id = '00000000-0000-7000-8000-0000000000e1' returning id $$,
	'a Member cannot delete the household'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000aa');
select isnt_empty(
	$$ delete from public.households where id = '00000000-0000-7000-8000-0000000000e1' returning id $$,
	'an Admin deletes a shared household'
);
select is(
	pg_temp.family_membership_count(),
	0,
	'deleting a household removes its Memberships'
);

select * from finish();
rollback;
