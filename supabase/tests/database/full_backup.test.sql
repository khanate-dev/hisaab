-- Full backup: a household restored from one is marked so and holds only the backup's Categories, never the template's
-- too; a household made from scratch still gets the template; and whether it was restored can't change afterwards.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000066a1', 'admin@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.categories(household uuid) returns integer language sql security definer as $$
	select count(*)::integer from public.categories where household_id = household;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000066a1');
insert into public.households (id, name, created_by) values
	('00000000-0000-7000-8000-0000000066f1', 'Fresh', '00000000-0000-4000-8000-0000000066a1');
insert into public.households (id, name, created_by, restored_at) values
	('00000000-0000-7000-8000-0000000066f2', 'Restored', '00000000-0000-4000-8000-0000000066a1', now());
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000066e1', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a1', 'admin'),
	('00000000-0000-7000-8000-0000000066e2', '00000000-0000-7000-8000-0000000066f2', '00000000-0000-4000-8000-0000000066a1', 'admin');
reset role;

select ok(pg_temp.categories('00000000-0000-7000-8000-0000000066f1') > 0, 'a household made from scratch gets the template');
select is(pg_temp.categories('00000000-0000-7000-8000-0000000066f2'), 0,
	'a restored one has none of its own: the backup brings them');

select pg_temp.act_as('00000000-0000-4000-8000-0000000066a1');
select throws_ok(
	$$ update public.households set restored_at = null where id = '00000000-0000-7000-8000-0000000066f2' $$,
	'42501', null, 'whether it was restored can''t be undone'
);
select throws_ok(
	$$ update public.households set restored_at = now() where id = '00000000-0000-7000-8000-0000000066f1' $$,
	'42501', null, 'nor claimed later'
);
reset role;

select * from finish();
rollback;
