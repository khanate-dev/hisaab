-- Items (spec §3.3): Admins and Members add, edit and remove an Expense's Items; Viewers, outsiders and anon can't;
-- only an Expense has Items, each in an Expense Category of its own household; deleting the Expense removes them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000004a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000004b1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000004c1', 'stranger@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-0000000004f1', 'Family'),
	('00000000-0000-7000-8000-0000000004f2', 'Elsewhere');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000004f1', '00000000-0000-4000-8000-0000000004a1', 'member'),
	('00000000-0000-7000-8000-0000000004e2', '00000000-0000-7000-8000-0000000004f1', '00000000-0000-4000-8000-0000000004b1', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000004c1', '00000000-0000-7000-8000-0000000004f1', 'Cash', 'cash', 'PKR');

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
create function pg_temp.item(id text, entry_id text, category_id uuid, amount numeric default 100) returns text language sql as $$
	select format(
		$q$ insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id)
		    values (%L, '00000000-0000-7000-8000-0000000004f1', %L, 0, 'Milk', %s, %L) $q$,
		id, entry_id, amount, category_id);
$$;

insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-0000000004d1', '00000000-0000-7000-8000-0000000004f1', '00000000-0000-7000-8000-0000000004c1',
		'expense', -450, pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Groceries'), '2026-10-26', '00000000-0000-4000-8000-0000000004a1'),
	('00000000-0000-7000-8000-0000000004d2', '00000000-0000-7000-8000-0000000004f1', '00000000-0000-7000-8000-0000000004c1',
		'income', 900, pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Salary'), '2026-10-26', '00000000-0000-4000-8000-0000000004a1'),
	('00000000-0000-7000-8000-0000000004d3', '00000000-0000-7000-8000-0000000004f1', '00000000-0000-7000-8000-0000000004c1',
		'expense', -10, pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Travel'), '2026-10-26', '00000000-0000-4000-8000-0000000004a1');

select pg_temp.act_as('00000000-0000-4000-8000-0000000004a1');
select lives_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a1', '00000000-0000-7000-8000-0000000004d1',
		pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Groceries')),
	'a Member adds an Item to an Expense'
);
select lives_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a2', '00000000-0000-7000-8000-0000000004d1',
		pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Dining out'), 350),
	'an Item has its own Category'
);
select throws_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a3', '00000000-0000-7000-8000-0000000004d2',
		pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Groceries')),
	'23514', null, 'only an Expense has Items'
);
select throws_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a4', '00000000-0000-7000-8000-0000000004d1',
		pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Salary')),
	'23514', null, 'an Item''s Category is from the Expense list'
);
select throws_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a5', '00000000-0000-7000-8000-0000000004d1',
		pg_temp.category('00000000-0000-7000-8000-0000000004f2', 'Groceries')),
	'23503', null, 'an Item''s Category is from its own household'
);
select throws_ok(
	pg_temp.item('00000000-0000-7000-8000-0000000004a6', '00000000-0000-7000-8000-0000000004d1',
		pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Groceries'), 0),
	'23514', null, 'an Item''s amount is more than zero'
);
select is(pg_temp.affected($$ update public.entry_items set quantity = '2 litres' where id = '00000000-0000-7000-8000-0000000004a1' $$), 1,
	'a Member edits an Item');
select throws_ok(
	$$ update public.entry_items set entry_id = '00000000-0000-7000-8000-0000000004d3' where id = '00000000-0000-7000-8000-0000000004a1' $$,
	'42501', null, 'an Item stays on its Expense'
);
select throws_ok(
	format($$ delete from public.categories where id = %L $$, pg_temp.category('00000000-0000-7000-8000-0000000004f1', 'Dining out')),
	'23503', null, 'a Category an Item is in can''t be deleted'
);

-- Viewers, outsiders and anon. (Former members join with account deletion, #64.)
select pg_temp.act_as('00000000-0000-4000-8000-0000000004b1');
select is((select count(*)::int from public.entry_items), 2, 'a Viewer reads the household''s Items');
select is(pg_temp.affected($$ delete from public.entry_items where id = '00000000-0000-7000-8000-0000000004a1' $$), 0,
	'a Viewer can''t remove an Item');
select pg_temp.act_as('00000000-0000-4000-8000-0000000004c1');
select is((select count(*)::int from public.entry_items), 0, 'someone outside the household can''t read its Items');
select is(pg_temp.affected($$ update public.entry_items set description = 'Mine' $$), 0,
	'someone outside the household can''t edit its Items');
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.entry_items $$, '42501', null, 'anon cannot read Items');
select set_config('role', 'postgres', true);

select pg_temp.act_as('00000000-0000-4000-8000-0000000004a1');
select is(pg_temp.affected($$ delete from public.entry_items where id = '00000000-0000-7000-8000-0000000004a2' $$), 1,
	'a Member removes an Item');
select pg_temp.act_as('00000000-0000-4000-8000-0000000004a1');
delete from public.entries where id = '00000000-0000-7000-8000-0000000004d1';
select is((select count(*)::int from public.entry_items where entry_id = '00000000-0000-7000-8000-0000000004d1'), 0,
	'deleting an Expense removes its Items');

select * from finish();
rollback;
