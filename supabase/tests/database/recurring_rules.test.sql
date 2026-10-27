-- Recurring rules and Occurrences: Admins and Members make rules as themselves, from the right list, with a schedule
-- that adds up; Viewers and outsiders don't; what's done with an Occurrence is the household's; two devices confirming
-- the same Occurrence merge into one Entry, and a late skip doesn't undo a confirm.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000dda1', 'alice@example.com'),
	('00000000-0000-4000-8000-00000000dda2', 'bob@example.com'),
	('00000000-0000-4000-8000-00000000dda3', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000dda4', 'outsider@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-00000000ddf1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000dde1', '00000000-0000-7000-8000-00000000ddf1', '00000000-0000-4000-8000-00000000dda1', 'admin'),
	('00000000-0000-7000-8000-00000000dde2', '00000000-0000-7000-8000-00000000ddf1', '00000000-0000-4000-8000-00000000dda2', 'member'),
	('00000000-0000-7000-8000-00000000dde3', '00000000-0000-7000-8000-00000000ddf1', '00000000-0000-4000-8000-00000000dda3', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000ddc1', '00000000-0000-7000-8000-00000000ddf1', 'Cash', 'cash', 'PKR');

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
create function pg_temp.category(category_name text) returns uuid language sql security definer as $$
	select id from public.categories where household_id = '00000000-0000-7000-8000-00000000ddf1' and name = category_name;
$$;
-- A rule, as the acting User, with a schedule and mode given as SQL.
create function pg_temp.rule(id text, category text, rest text) returns text language sql as $$
	select format($f$ insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, created_by,
		frequency, day_of_month, starts_on, mode, amount)
		values (%L, '00000000-0000-7000-8000-00000000ddf1', 'expense', '00000000-0000-7000-8000-00000000ddc1', %L,
		        (select auth.uid()), %s) $f$, id, pg_temp.category(category), rest);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000dda1');
select lives_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd01', 'Rent', $$ 'monthly', 1, '2026-10-01', 'confirm', 50000 $$),
	'an Admin makes a monthly rule, Confirm by default');
select lives_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd02', 'Utilities', $$ 'monthly', 31, '2026-10-01', 'confirm', null $$),
	'a variable bill has no amount');
select throws_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd03', 'Utilities', $$ 'monthly', 31, '2026-10-01', 'auto', null $$),
	'23514', null, 'but Auto-record needs one');
select throws_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd04', 'Rent', $$ 'weekly', 3, '2026-10-01', 'confirm', 1 $$),
	'23514', null, 'only a monthly rule has a day of the month');
select throws_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd05', 'Rent', $$ 'monthly', 32, '2026-10-01', 'confirm', 1 $$),
	'23514', null, 'which is a real one');
select throws_ok(pg_temp.rule('00000000-0000-7000-8000-00000000dd06', 'Salary', $$ 'monthly', 1, '2026-10-01', 'confirm', 1 $$),
	'23514', null, 'an Expense rule''s Category is from the Expense list');
select throws_ok(
	$$ insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, created_by, frequency, starts_on, ends_on)
	   values ('00000000-0000-7000-8000-00000000dd07', '00000000-0000-7000-8000-00000000ddf1', 'expense',
	           '00000000-0000-7000-8000-00000000ddc1', pg_temp.category('Rent'), (select auth.uid()), 'yearly',
	           '2026-10-01', '2026-09-01') $$,
	'23514', null, 'and an end comes after the start'
);
select throws_ok(
	$$ insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, created_by, frequency, starts_on)
	   values ('00000000-0000-7000-8000-00000000dd08', '00000000-0000-7000-8000-00000000ddf1', 'expense',
	           '00000000-0000-7000-8000-00000000ddc1', pg_temp.category('Rent'), '00000000-0000-4000-8000-00000000dda2',
	           'yearly', '2026-10-01') $$,
	'42501', null, 'a rule is made in nobody else''s name'
);

select throws_ok(
	$$ insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
	   values ('86d0ac97-e4ad-5d3f-9764-44991570304d', '00000000-0000-7000-8000-00000000ddf1',
	           '00000000-0000-7000-8000-00000000dd01', '2026-10-01', 'confirmed', '00000000-0000-7000-8000-00000000dd99') $$,
	'23514', null, 'an Occurrence points at no Entry but the one derived from it'
);

-- Alice confirms October's rent: the Occurrence, then its Entry.
select lives_ok(
	$$ insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
	   values ('86d0ac97-e4ad-5d3f-9764-44991570304d', '00000000-0000-7000-8000-00000000ddf1',
	           '00000000-0000-7000-8000-00000000dd01', '2026-10-01', 'confirmed', '6d7e9ad5-7893-5327-94a5-1712abe5ac52') $$,
	'a Member confirms an Occurrence'
);
insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('6d7e9ad5-7893-5327-94a5-1712abe5ac52', '00000000-0000-7000-8000-00000000ddf1', '00000000-0000-7000-8000-00000000ddc1',
	 'expense', -50000, pg_temp.category('Rent'), '2026-10-01', '00000000-0000-4000-8000-00000000dda1');

-- Bob confirmed it too, offline: his copies upload over the same ids.
select pg_temp.act_as('00000000-0000-4000-8000-00000000dda2');
select lives_ok(
	$$ insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
	   values ('86d0ac97-e4ad-5d3f-9764-44991570304d', '00000000-0000-7000-8000-00000000ddf1',
	           '00000000-0000-7000-8000-00000000dd01', '2026-10-01', 'confirmed', '6d7e9ad5-7893-5327-94a5-1712abe5ac52')
	   on conflict (id) do update set state = excluded.state, entry_id = excluded.entry_id $$,
	'another device''s confirm of the same Occurrence lands'
);
select lives_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by, created_at)
	   values ('6d7e9ad5-7893-5327-94a5-1712abe5ac52', '00000000-0000-7000-8000-00000000ddf1',
	           '00000000-0000-7000-8000-00000000ddc1', 'expense', -50000, pg_temp.category('Rent'), '2026-10-01',
	           (select auth.uid()), now() + interval '1 hour')
	   on conflict (id) do update set amount = excluded.amount, created_by = excluded.created_by,
	     created_at = excluded.created_at $$,
	'and so does its Entry'
);
reset role;
select is(
	(select count(*)::int from public.entries where household_id = '00000000-0000-7000-8000-00000000ddf1' and kind = 'expense'),
	1, 'as one Entry, not two'
);
select is((select created_by from public.entries where id = '6d7e9ad5-7893-5327-94a5-1712abe5ac52'),
	'00000000-0000-4000-8000-00000000dda1'::uuid, 'recorded by whoever confirmed first');

select pg_temp.act_as('00000000-0000-4000-8000-00000000dda2');
select is(pg_temp.affected($$ update public.occurrences set state = 'skipped', entry_id = null
	where id = '86d0ac97-e4ad-5d3f-9764-44991570304d' $$), 1, 'a late skip from another device lands');
reset role;
select is((select state from public.occurrences where id = '86d0ac97-e4ad-5d3f-9764-44991570304d'), 'confirmed',
	'but leaves a confirmed Occurrence as it was');

select pg_temp.act_as('00000000-0000-4000-8000-00000000dda3');
select throws_ok(
	$$ insert into public.occurrences (id, household_id, rule_id, due_on, state, snoozed_until)
	   values ('b8fe83ba-66ad-5641-bde9-6daa9bca56c7', '00000000-0000-7000-8000-00000000ddf1',
	           '00000000-0000-7000-8000-00000000dd02', '2026-10-31', 'snoozed', '2026-11-03') $$,
	'42501', null, 'a Viewer snoozes nothing'
);
select pg_temp.act_as('00000000-0000-4000-8000-00000000dda4');
select is((select count(*)::int from public.recurring_rules) + (select count(*)::int from public.occurrences), 0,
	'someone outside the household sees none of it');

select * from finish();
rollback;
