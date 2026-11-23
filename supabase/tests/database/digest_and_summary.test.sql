-- The Household activity digest and the Monthly summary (#63): at a household's 20:00 the database gathers who opted
-- in to the digest and who changed what over the day before (changes made together once); on a Budget month's first
-- day at 09:00, the month just gone and everyone in the household; a Monthly summary goes by email only to whoever
-- opted in to that; its figures are exact, an itemized Expense's Items each against their own Category's parent; and
-- all of it is the service role's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000066a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000066a2', 'member@example.com');
insert into public.profiles (id, display_name) values
	('00000000-0000-4000-8000-0000000066a1', 'Ayesha'),
	('00000000-0000-4000-8000-0000000066a2', 'Bilal');
insert into public.households (id, name, timezone, budget_month_start_day, base_currency) values
	('00000000-0000-7000-8000-0000000066f1', 'Family', 'Asia/Karachi', 1, 'PKR'),
	('00000000-0000-7000-8000-0000000066f2', 'Elsewhere', 'America/New_York', 15, null);
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000066e1', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a1', 'admin'),
	('00000000-0000-7000-8000-0000000066e2', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a2', 'member');
insert into public.notification_preferences (id, household_id, user_id, trigger, enabled, email_enabled) values
	(extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		'preference/00000000-0000-4000-8000-0000000066a1/00000000-0000-7000-8000-0000000066f1/household_activity'),
	 '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a1', 'household_activity', true, null),
	(extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		'preference/00000000-0000-4000-8000-0000000066a1/00000000-0000-7000-8000-0000000066f1/monthly_summary'),
	 '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a1', 'monthly_summary', true, true);

-- Only this test's households, whatever else the database holds.
create function pg_temp.ours(facts jsonb) returns jsonb language sql as $$
	select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(facts) f
	where f ->> 'householdId' like '00000000-0000-7000-8000-0000000066f_';
$$;

-- Bilal's changes on Nov 1 (Karachi): two together, one alone, and one the evening before that the day before had.
insert into public.activity_log (household_id, table_name, row_id, action, actor_id, synced_at, transaction_id) values
	('00000000-0000-7000-8000-0000000066f1', 'entries', gen_random_uuid(), 'insert',
	 '00000000-0000-4000-8000-0000000066a2', '2026-11-01 10:00+05', 1),
	('00000000-0000-7000-8000-0000000066f1', 'entry_items', gen_random_uuid(), 'insert',
	 '00000000-0000-4000-8000-0000000066a2', '2026-11-01 10:00+05', 1),
	('00000000-0000-7000-8000-0000000066f1', 'entries', gen_random_uuid(), 'update',
	 '00000000-0000-4000-8000-0000000066a2', '2026-11-01 19:59+05', 2),
	('00000000-0000-7000-8000-0000000066f1', 'entries', gen_random_uuid(), 'insert',
	 '00000000-0000-4000-8000-0000000066a2', '2026-10-31 19:00+05', 3);

select is(jsonb_array_length(pg_temp.ours(public.digest_facts('2026-11-01 14:59Z'))), 0, 'no digest before 20:00');
select is(
	pg_temp.ours(public.digest_facts('2026-11-01 15:30Z')) -> 0,
	jsonb_build_object(
		'householdId', '00000000-0000-7000-8000-0000000066f1', 'householdName', 'Family', 'today', '2026-11-01',
		'optedIn', jsonb_build_array('00000000-0000-4000-8000-0000000066a1'),
		'changes', jsonb_build_array(jsonb_build_object(
			'actorId', '00000000-0000-4000-8000-0000000066a2', 'actorName', 'Bilal', 'count', 2))
	),
	'at 20:00 Karachi: who opted in, and the day''s changes by whom, those made together once'
);
select is(jsonb_array_length(pg_temp.ours(public.digest_facts('2026-11-01 15:30Z'))), 1, 'not yet New York''s evening');

select is(jsonb_array_length(pg_temp.ours(public.summary_facts('2026-11-01 03:59Z'))), 0, 'no summary before 09:00');
select is(
	pg_temp.ours(public.summary_facts('2026-11-01 04:30Z')),
	jsonb_build_array(jsonb_build_object(
		'householdId', '00000000-0000-7000-8000-0000000066f1', 'householdName', 'Family', 'month', '2026-10',
		'members', jsonb_build_array('00000000-0000-4000-8000-0000000066a1', '00000000-0000-4000-8000-0000000066a2')
	)),
	'on a Budget month''s first day at 09:00: the month gone, to everyone'
);
select is(jsonb_array_length(pg_temp.ours(public.summary_facts('2026-11-02 04:30Z'))), 0, 'and on no other day');

-- October, in PKR: 1,000 came in; 300 on Snacks (under Food), an itemized 150 (70 Home, 80 Fuel), 20 on Fuel.
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000066c1', '00000000-0000-7000-8000-0000000066f1', 'Cash', 'cash', 'PKR');
insert into public.categories (id, household_id, kind, parent_id, name, icon, color) values
	('00000000-0000-7000-8000-000000006601', '00000000-0000-7000-8000-0000000066f1', 'expense', null, 'T Food', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000006602', '00000000-0000-7000-8000-0000000066f1', 'expense',
	 '00000000-0000-7000-8000-000000006601', 'T Snacks', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000006603', '00000000-0000-7000-8000-0000000066f1', 'expense', null, 'T Fuel', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000006604', '00000000-0000-7000-8000-0000000066f1', 'expense', null, 'T Home', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000006605', '00000000-0000-7000-8000-0000000066f1', 'income', null, 'T Salary', 'gifts', 'lime');
insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-000000006631', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-0000000066c1',
	 'income', 1000, '00000000-0000-7000-8000-000000006605', '2026-10-01', '00000000-0000-4000-8000-0000000066a1'),
	('00000000-0000-7000-8000-000000006632', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-0000000066c1',
	 'expense', -300, '00000000-0000-7000-8000-000000006602', '2026-10-05', '00000000-0000-4000-8000-0000000066a1'),
	('00000000-0000-7000-8000-000000006633', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-0000000066c1',
	 'expense', -150, '00000000-0000-7000-8000-000000006604', '2026-10-06', '00000000-0000-4000-8000-0000000066a1'),
	('00000000-0000-7000-8000-000000006634', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-0000000066c1',
	 'expense', -20, '00000000-0000-7000-8000-000000006603', '2026-10-31', '00000000-0000-4000-8000-0000000066a1'),
	('00000000-0000-7000-8000-000000006635', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-0000000066c1',
	 'expense', -999, '00000000-0000-7000-8000-000000006603', '2026-11-01', '00000000-0000-4000-8000-0000000066a1');
insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id) values
	('00000000-0000-7000-8000-000000006641', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-000000006633',
	 0, 'Paint', 70, '00000000-0000-7000-8000-000000006604'),
	('00000000-0000-7000-8000-000000006642', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-7000-8000-000000006633',
	 1, 'Petrol', 80, '00000000-0000-7000-8000-000000006603');

insert into public.notifications (id, household_id, user_id, trigger, payload, dedupe_key) values
	('00000000-0000-7000-8000-000000006651', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a1',
	 'monthly_summary', '{"householdName": "Family", "month": "2026-10"}', 'monthly_summary/x/2026-10'),
	('00000000-0000-7000-8000-000000006652', '00000000-0000-7000-8000-0000000066f1', '00000000-0000-4000-8000-0000000066a2',
	 'monthly_summary', '{"householdName": "Family", "month": "2026-10"}', 'monthly_summary/x/2026-10');
select results_eq(
	$$ select notification_id, channel, target from public.notification_deliveries where channel = 'email' $$,
	$$ values ('00000000-0000-7000-8000-000000006651'::uuid, 'email', 'admin@example.com') $$,
	'a Monthly summary goes by email only to whoever opted in to it'
);

select is(
	public.monthly_summary_figures('00000000-0000-7000-8000-000000006651') - 'categories',
	jsonb_build_object('householdName', 'Family', 'month', '2026-10', 'first', '2026-10-01', 'last', '2026-10-31',
		'currency', 'PKR', 'decimals', 2, 'income', '1000', 'expense', '470', 'net', '530'),
	'the month''s Incomes and Expenses, exact, and what was left'
);
select is(
	public.monthly_summary_figures('00000000-0000-7000-8000-000000006651') -> 'categories',
	jsonb_build_array(
		jsonb_build_object('name', 'T Food', 'amount', '300'),
		jsonb_build_object('name', 'T Fuel', 'amount', '100'),
		jsonb_build_object('name', 'T Home', 'amount', '70')
	),
	'what it spent most on, Subcategories under their parent and Items each against their own'
);

set local role authenticated;
select throws_ok($$ select public.digest_facts(now()) $$, '42501', null, 'the digest''s facts are the service role''s');
select throws_ok($$ select public.summary_facts(now()) $$, '42501', null, 'the summary''s too');
select throws_ok(
	$$ select public.monthly_summary_figures('00000000-0000-7000-8000-000000006651') $$, '42501', null,
	'and its figures'
);
reset role;
select is(public.monthly_summary_figures('00000000-0000-7000-8000-000000006699'), null, 'no figures for no summary');

select * from finish();
rollback;
