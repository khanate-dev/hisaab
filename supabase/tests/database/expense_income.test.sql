-- Expense and Income (spec §3.3): an Expense takes money out and an Income brings it in, each with a Category from
-- its own list; times are HH:MM; Admins and Members delete Entries, Viewers and outsiders can't; a Category in use
-- can't be deleted; the household timezone is a real one.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000003a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000003b1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000003c1', 'stranger@example.com'),
	('00000000-0000-4000-8000-0000000003a2', 'admin@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-0000000003f1', 'Family'),
	('00000000-0000-7000-8000-0000000003f2', 'Elsewhere');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000003e1', '00000000-0000-7000-8000-0000000003f1', '00000000-0000-4000-8000-0000000003a1', 'member'),
	('00000000-0000-7000-8000-0000000003e2', '00000000-0000-7000-8000-0000000003f1', '00000000-0000-4000-8000-0000000003b1', 'viewer'),
	('00000000-0000-7000-8000-0000000003e3', '00000000-0000-7000-8000-0000000003f1', '00000000-0000-4000-8000-0000000003a2', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000003c1', '00000000-0000-7000-8000-0000000003f1', 'Cash', 'cash', 'PKR');

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
-- Records an Entry as the Member: kind, amount, category (by name, in Family) and extra columns.
create function pg_temp.record(id text, kind text, amount numeric, category_id uuid, extra text default '') returns text
language sql as $$
	select format(
		$q$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by, category_id%s)
		    values (%L, '00000000-0000-7000-8000-0000000003f1', '00000000-0000-7000-8000-0000000003c1', %L, %s,
		            '2026-10-26', '00000000-0000-4000-8000-0000000003a1', %L%s) $q$,
		case when extra = '' then '' else ', ' || split_part(extra, '=', 1) end,
		id, kind, amount, category_id,
		case when extra = '' then '' else ', ' || split_part(extra, '=', 2) end
	);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000003a1');
select lives_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d1', 'expense', -450,
		pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries'), 'occurred_time=''18:30'''),
	'a Member records an Expense with a time'
);
select lives_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d2', 'income', 90000,
		pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Salary'), 'notes=''October'''),
	'a Member records an Income with notes'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d3', 'expense', 450, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries')),
	'23514', null, 'an Expense takes money out'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d4', 'income', -10, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Salary')),
	'23514', null, 'an Income brings money in'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d5', 'expense', -10, null),
	'23514', null, 'an Expense has a Category'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d6', 'expense', -10, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Salary')),
	'23514', null, 'an Expense''s Category is from the Expense list'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d7', 'balance_adjustment', 10, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries')),
	'23514', null, 'a Balance adjustment has no Category'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d8', 'expense', -10, pg_temp.category('00000000-0000-7000-8000-0000000003f2', 'Groceries')),
	'23503', null, 'an Entry''s Category is from its own household'
);
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003d9', 'expense', -10,
		pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries'), 'occurred_time=''25:00'''),
	'23514', null, 'a time is HH:MM'
);
select throws_ok(
	format($$ delete from public.categories where id = %L $$, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries')),
	'23503', null, 'a Category in use can''t be deleted'
);
select is(pg_temp.affected($$ update public.entries set amount = -500, notes = 'Weekly shop' where id = '00000000-0000-7000-8000-0000000003d1' $$), 1,
	'a Member edits an Expense');

select is(pg_temp.affected($$ update public.categories set archived_at = now() where name = 'Travel' and household_id = '00000000-0000-7000-8000-0000000003f1' $$), 1,
	'a Member archives a Category');
select throws_ok(
	pg_temp.record('00000000-0000-7000-8000-0000000003da', 'expense', -10, pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Travel')),
	'23514', null, 'an archived Category takes no new Entries'
);
select is(pg_temp.affected(format($$ update public.categories set archived_at = now() where id = %L $$,
	pg_temp.category('00000000-0000-7000-8000-0000000003f1', 'Groceries'))), 1, 'a Category in use can be archived');
select is(pg_temp.affected($$ update public.entries set notes = 'Still here' where id = '00000000-0000-7000-8000-0000000003d1' $$), 1,
	'an Entry in an archived Category stays editable');

-- Deleting Entries. (Former members join with account deletion, #64.)
select set_config('role', 'anon', true);
select throws_ok($$ delete from public.entries $$, '42501', null, 'anon cannot delete Entries');
select set_config('role', 'postgres', true);
select pg_temp.act_as('00000000-0000-4000-8000-0000000003b1');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000003d1' $$), 0,
	'a Viewer can''t delete an Entry');
select pg_temp.act_as('00000000-0000-4000-8000-0000000003c1');
select is(pg_temp.affected($$ delete from public.entries where household_id = '00000000-0000-7000-8000-0000000003f1' $$), 0,
	'someone outside the household can''t delete its Entries');
select pg_temp.act_as('00000000-0000-4000-8000-0000000003a1');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000003d1' $$), 1,
	'a Member deletes an Entry');
select pg_temp.act_as('00000000-0000-4000-8000-0000000003a2');
select is(pg_temp.affected($$ delete from public.entries where id = '00000000-0000-7000-8000-0000000003d2' $$), 1,
	'an Admin deletes an Entry');

-- The household timezone.
select is(pg_temp.affected($$ update public.households set timezone = 'Asia/Karachi' where id = '00000000-0000-7000-8000-0000000003f1' $$), 1,
	'an Admin sets the household timezone');
select throws_ok(
	$$ update public.households set timezone = 'Mars/Olympus_Mons' where id = '00000000-0000-7000-8000-0000000003f1' $$,
	'22023', null, 'the household timezone is a real one'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000003a1');
select is(pg_temp.affected($$ update public.households set timezone = 'Europe/London' where id = '00000000-0000-7000-8000-0000000003f1' $$), 0,
	'a Member can''t change the household timezone');

select * from finish();
rollback;
