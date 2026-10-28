-- Saved filters: private to the User who saved them, Viewers included; nobody saves one in someone else's name or in
-- a household they're not in, and one stays its User's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000eea1', 'alice@example.com'),
	('00000000-0000-4000-8000-00000000eea2', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000eea3', 'outsider@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-00000000eef1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000eee1', '00000000-0000-7000-8000-00000000eef1', '00000000-0000-4000-8000-00000000eea1', 'admin'),
	('00000000-0000-7000-8000-00000000eee2', '00000000-0000-7000-8000-00000000eef1', '00000000-0000-4000-8000-00000000eea2', 'viewer');

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

select pg_temp.act_as('00000000-0000-4000-8000-00000000eea1');
select lives_ok(
	$$ insert into public.saved_filters (id, household_id, user_id, name, criteria)
	   values ('00000000-0000-7000-8000-00000000ee01', '00000000-0000-7000-8000-00000000eef1', (select auth.uid()),
	           'Big groceries', '{"query": ">2000"}') $$,
	'an Admin saves a filter'
);
select throws_ok(
	$$ insert into public.saved_filters (id, household_id, user_id, name, criteria)
	   values ('00000000-0000-7000-8000-00000000ee02', '00000000-0000-7000-8000-00000000eef1',
	           '00000000-0000-4000-8000-00000000eea2', 'Theirs', '{}') $$,
	'42501', null, 'but not in someone else''s name'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000eea2');
select lives_ok(
	$$ insert into public.saved_filters (id, household_id, user_id, name, criteria)
	   values ('00000000-0000-7000-8000-00000000ee03', '00000000-0000-7000-8000-00000000eef1', (select auth.uid()),
	           'Rent', '{"query": "rent"}') $$,
	'a Viewer, who searches too, saves their own'
);
select is((select count(*)::int from public.saved_filters), 1, 'and sees only their own');
select is(pg_temp.affected($$ update public.saved_filters set name = 'Mine' where id = '00000000-0000-7000-8000-00000000ee01' $$),
	0, 'changes nobody else''s');
select is(pg_temp.affected($$ delete from public.saved_filters where id = '00000000-0000-7000-8000-00000000ee01' $$),
	0, 'nor deletes it');

select pg_temp.act_as('00000000-0000-4000-8000-00000000eea3');
select throws_ok(
	$$ insert into public.saved_filters (id, household_id, user_id, name, criteria)
	   values ('00000000-0000-7000-8000-00000000ee04', '00000000-0000-7000-8000-00000000eef1', (select auth.uid()),
	           'Snooping', '{}') $$,
	'42501', null, 'someone outside the household saves none there'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000eea1');
select throws_ok(
	$$ update public.saved_filters set user_id = '00000000-0000-4000-8000-00000000eea2'
	   where id = '00000000-0000-7000-8000-00000000ee01' $$,
	'42501', null, 'a Saved filter stays its User''s'
);

select * from finish();
rollback;
