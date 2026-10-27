-- Budgets and Budget overrides: standing amounts from a Budget month on and one-month overrides, never negative, in
-- the Category's own household; two for the same month (from two devices offline) both land; Admins and Members set them, Viewers and
-- outsiders don't; a Budget stays for its Category and month.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000cca1', 'member@example.com'),
	('00000000-0000-4000-8000-00000000cca2', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000cca3', 'outsider@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-00000000ccf1', 'Family'),
	('00000000-0000-7000-8000-00000000ccf2', 'Other');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000cce1', '00000000-0000-7000-8000-00000000ccf1', '00000000-0000-4000-8000-00000000cca1', 'member'),
	('00000000-0000-7000-8000-00000000cce2', '00000000-0000-7000-8000-00000000ccf1', '00000000-0000-4000-8000-00000000cca2', 'viewer'),
	('00000000-0000-7000-8000-00000000cce3', '00000000-0000-7000-8000-00000000ccf2', '00000000-0000-4000-8000-00000000cca3', 'member');

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
create function pg_temp.category(household uuid, category_name text) returns uuid language sql security definer as $$
	select id from public.categories where household_id = household and name = category_name;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000cca1');
select lives_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc01', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-10', 30000) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'a Member sets a Budget from a Budget month on'
);
select lives_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc02', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-10', 1) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'another device setting the same month offline isn''t refused (the one written last wins)'
);
select lives_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc03', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-12', 0) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'and a new one from a later month, zero included'
);
select throws_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc04', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-11', -1) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'23514', null, 'never a negative one'
);
select throws_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc05', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-13', 1) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'23514', null, 'and only from a real Budget month'
);
select throws_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc06', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-10', 1) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf2', 'Groceries')),
	'23503', null, 'for one of the household''s own Categories'
);
select lives_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc08', '00000000-0000-7000-8000-00000000ccf1', %L, '2027-03', null) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'or stops it from a month on'
);
select lives_ok(
	format($$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
	   values ('00000000-0000-7000-8000-00000000cc07', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-10', 250000) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Salary')),
	'Expected income is set the same way'
);
select lives_ok(
	format($$ insert into public.budget_overrides (id, household_id, category_id, month, amount)
	   values ('00000000-0000-7000-8000-00000000cc11', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-11', 45000) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'a Member overrides a Budget for one month'
);
select lives_ok(
	format($$ insert into public.budget_overrides (id, household_id, category_id, month, amount)
	   values ('00000000-0000-7000-8000-00000000cc12', '00000000-0000-7000-8000-00000000ccf1', %L, '2026-11', 1) $$,
	   pg_temp.category('00000000-0000-7000-8000-00000000ccf1', 'Groceries')),
	'nor an override'
);
select is(pg_temp.affected($$ update public.budgets set amount = 32000 where id = '00000000-0000-7000-8000-00000000cc01' $$),
	1, 'and changes a Budget''s amount');
select throws_ok($$ update public.budgets set valid_from = '2026-09' where id = '00000000-0000-7000-8000-00000000cc01' $$,
	'42501', null, 'but not the month it''s from');

select pg_temp.act_as('00000000-0000-4000-8000-00000000cca2');
select is(pg_temp.affected($$ update public.budget_overrides set amount = 0 where id = '00000000-0000-7000-8000-00000000cc11' $$),
	0, 'a Viewer changes no Budget');
select is((select count(*)::int from public.budgets), 5, 'but reads them all');

select pg_temp.act_as('00000000-0000-4000-8000-00000000cca3');
select is((select count(*)::int from public.budgets) + (select count(*)::int from public.budget_overrides), 0,
	'someone outside the household reads none of them');

select * from finish();
rollback;
