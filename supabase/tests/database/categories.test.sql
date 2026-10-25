-- Categories (spec §3.3): every household gets the template's Expense and Income Categories; Admins and Members
-- manage them, Viewers can't; Subcategories are one level deep, in their parent's list and household; a Category with
-- Subcategories can't be deleted.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000002a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000002b1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000002c1', 'stranger@example.com'),
	('00000000-0000-4000-8000-0000000002a2', 'admin@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-0000000002f1', 'Family'),
	('00000000-0000-7000-8000-0000000002f2', 'Elsewhere');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000002e1', '00000000-0000-7000-8000-0000000002f1', '00000000-0000-4000-8000-0000000002a1', 'member'),
	('00000000-0000-7000-8000-0000000002e2', '00000000-0000-7000-8000-0000000002f1', '00000000-0000-4000-8000-0000000002b1', 'viewer'),
	('00000000-0000-7000-8000-0000000002e3', '00000000-0000-7000-8000-0000000002f1', '00000000-0000-4000-8000-0000000002a2', 'admin');
insert into public.categories (id, household_id, kind, name, icon, color) values
	('00000000-0000-7000-8000-0000000002d9', '00000000-0000-7000-8000-0000000002f2', 'expense', 'Theirs', 'gifts', 'lime');

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
create function pg_temp.family_category(category_name text) returns uuid language sql as $$
	select id from public.categories
	where household_id = '00000000-0000-7000-8000-0000000002f1' and name = category_name;
$$;

-- The template, copied into each new household.
select is(
	(select count(*)::int from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1'),
	(select count(*)::int from private.category_template),
	'a new household gets a copy of every template Category'
);
select ok(
	exists (select 1 from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1' and kind = 'expense')
	and exists (select 1 from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1' and kind = 'income'),
	'the copy has separate Expense and Income lists'
);
select is(
	(select p.name from public.categories c join public.categories p on p.id = c.parent_id where c.id = pg_temp.family_category('Groceries')),
	'Food',
	'template Subcategories sit under their copied parent'
);
select is(
	(select count(*)::int from public.categories c join public.categories p on p.id = c.parent_id
	 where c.household_id = '00000000-0000-7000-8000-0000000002f1' and p.household_id <> c.household_id),
	0,
	'copied Subcategories point at their own household''s parents'
);

-- anon, strangers and Viewers. (Former members join with account deletion, #64.)
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.categories $$, '42501', null, 'anon cannot read Categories');
select set_config('role', 'postgres', true);
select pg_temp.act_as('00000000-0000-4000-8000-0000000002c1');
select is((select count(*)::int from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1'), 0,
	'someone outside the household can''t read its Categories');
select throws_ok(
	$$ insert into public.categories (id, household_id, kind, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d6', '00000000-0000-7000-8000-0000000002f1', 'expense', 'Mine', 'gifts', 'lime') $$,
	'42501', null, 'someone outside the household can''t add a Category to it'
);
select is(pg_temp.affected($$ update public.categories set name = 'Mine' where household_id = '00000000-0000-7000-8000-0000000002f1' $$), 0,
	'someone outside the household can''t edit its Categories');
select is(pg_temp.affected($$ delete from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1' $$), 0,
	'someone outside the household can''t delete its Categories');
select pg_temp.act_as('00000000-0000-4000-8000-0000000002b1');
select ok((select count(*) from public.categories where household_id = '00000000-0000-7000-8000-0000000002f1') > 0,
	'a Viewer reads the household''s Categories');
select throws_ok(
	$$ insert into public.categories (id, household_id, kind, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d1', '00000000-0000-7000-8000-0000000002f1', 'expense', 'Pets', 'gifts', 'lime') $$,
	'42501', null, 'a Viewer can''t add a Category'
);
select is(pg_temp.affected(format($$ update public.categories set name = 'Mine' where id = %L $$, pg_temp.family_category('Travel'))), 0,
	'a Viewer can''t edit a Category');
select is(pg_temp.affected(format($$ delete from public.categories where id = %L $$, pg_temp.family_category('Travel'))), 0,
	'a Viewer can''t delete a Category');

-- Members.
select pg_temp.act_as('00000000-0000-4000-8000-0000000002a1');
select lives_ok(
	$$ insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d2', '00000000-0000-7000-8000-0000000002f1', 'expense',
	           pg_temp.family_category('Food'), 'Takeaway', 'dining', 'butter') $$,
	'a Member adds a Subcategory'
);
select throws_ok(
	$$ insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d3', '00000000-0000-7000-8000-0000000002f1', 'expense',
	           '00000000-0000-7000-8000-0000000002d2', 'Pizza', 'dining', 'butter') $$,
	'23514', null, 'Subcategories are one level deep'
);
select throws_ok(
	$$ insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d4', '00000000-0000-7000-8000-0000000002f1', 'income',
	           pg_temp.family_category('Food'), 'Refunds', 'income', 'cyan') $$,
	'23514', null, 'a Subcategory is in its parent''s list'
);
select throws_ok(
	$$ insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d5', '00000000-0000-7000-8000-0000000002f1', 'expense',
	           '00000000-0000-7000-8000-0000000002d9', 'Borrowed', 'gifts', 'lime') $$,
	'23503', null, 'a Subcategory''s parent is in its own household'
);
select throws_ok(
	format($$ update public.categories set parent_id = %L where id = %L $$, pg_temp.family_category('Travel'), pg_temp.family_category('Food')),
	'23514', null, 'a Category with Subcategories can''t become one'
);
select throws_ok(
	format($$ update public.categories set kind = 'income' where id = %L $$, pg_temp.family_category('Travel')),
	'42501', null, 'a Category stays in its list'
);
select is(pg_temp.affected(format($$ update public.categories set archived_at = now() where id = %L $$, pg_temp.family_category('Travel'))), 1,
	'a Member archives a Category');
select throws_ok(
	format($$ delete from public.categories where id = %L $$, pg_temp.family_category('Food')),
	'23503', null, 'a Category with Subcategories can''t be deleted'
);
select is(pg_temp.affected($$ delete from public.categories where id = '00000000-0000-7000-8000-0000000002d2' $$), 1,
	'a Member deletes an unused Category');

-- Archived together: a parent's Subcategories go with it, and none stays active under it.
select is(pg_temp.affected(format($$ update public.categories set archived_at = now() where id = %L $$, pg_temp.family_category('Housing'))), 1,
	'a Member archives a Category with Subcategories');
select is(
	(select count(*)::int from public.categories where parent_id = pg_temp.family_category('Housing') and archived_at is null),
	0,
	'its Subcategories are archived with it'
);
select throws_ok(
	format($$ insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d7', '00000000-0000-7000-8000-0000000002f1', 'expense', %L, 'Garden', 'home', 'green') $$,
	   pg_temp.family_category('Housing')),
	'23514', null, 'no active Subcategory is added under an archived Category'
);
select throws_ok(
	format($$ update public.categories set archived_at = null where id = %L $$, pg_temp.family_category('Rent')),
	'23514', null, 'a Subcategory comes back only after its parent'
);

-- Admins.
select pg_temp.act_as('00000000-0000-4000-8000-0000000002a2');
select lives_ok(
	$$ insert into public.categories (id, household_id, kind, name, icon, color)
	   values ('00000000-0000-7000-8000-0000000002d8', '00000000-0000-7000-8000-0000000002f1', 'income', 'Rent received', 'home', 'green') $$,
	'an Admin adds a Category'
);
select is(pg_temp.affected($$ delete from public.categories where id = '00000000-0000-7000-8000-0000000002d8' $$), 1,
	'an Admin deletes an unused Category');

select * from finish();
rollback;
