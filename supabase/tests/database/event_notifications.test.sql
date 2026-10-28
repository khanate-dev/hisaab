-- Event notifications: at a household's 09:00 the database gathers what `scheduledNotifications` needs (Members,
-- Occurrences due in the last 3 days, open Loans due soon or overdue, Budgets 80% or 100% used, counted as the Budgets
-- tab counts them) and nothing elsewhere; raising is once only by dedupe key, only to someone in the household; both
-- are the service role's; and a User can't rewrite a Notification's dedupe key.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000055a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000055a2', 'outsider@example.com');
insert into public.households (id, name, timezone) values
	('00000000-0000-7000-8000-0000000055f1', 'Family', 'Asia/Karachi'),
	('00000000-0000-7000-8000-0000000055f2', 'Elsewhere', 'America/New_York');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000055e1', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-4000-8000-0000000055a1', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000055c1', '00000000-0000-7000-8000-0000000055f1', 'Cash', 'cash', 'PKR');
insert into public.categories (id, household_id, kind, parent_id, name, icon, color) values
	('00000000-0000-7000-8000-000000005501', '00000000-0000-7000-8000-0000000055f1', 'expense', null, 'T Food', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000005502', '00000000-0000-7000-8000-0000000055f1', 'expense',
	 '00000000-0000-7000-8000-000000005501', 'T Snacks', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000005503', '00000000-0000-7000-8000-0000000055f1', 'expense', null, 'T Fuel', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000005504', '00000000-0000-7000-8000-0000000055f1', 'expense', null, 'T Rent', 'gifts', 'lime'),
	('00000000-0000-7000-8000-000000005505', '00000000-0000-7000-8000-0000000055f1', 'expense', null, 'T Home', 'gifts', 'lime');

create function pg_temp.spend(id text, category uuid, amount numeric, day date) returns void language sql as $$
	insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by)
	values (id::uuid, '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-0000000055c1', 'expense', -amount,
		category, day, '00000000-0000-4000-8000-0000000055a1');
$$;

select is(private.budget_month_start('2026-11-10', 1), '2026-11-01'::date, 'a Budget month from the 1st');
select is(private.budget_month_start('2026-11-10', 15), '2026-10-15'::date, 'one from the 15th, before it''s reached');
select is(private.budget_month_start('2026-01-05', 15), '2025-12-15'::date, 'back across a year');

-- T Food: 1,000 standing, overridden to 500 this month; 300 of its own and 100 of its Subcategory's, so 80% exactly.
insert into public.budgets (id, household_id, category_id, valid_from, amount, created_at) values
	('00000000-0000-7000-8000-000000005511', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005501',
	 '2026-01', 1000, now() - interval '9 days');
insert into public.budget_overrides (id, household_id, category_id, month, amount, created_at) values
	('00000000-0000-7000-8000-000000005521', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005501',
	 '2026-11', 900, now() - interval '8 days'),
	('00000000-0000-7000-8000-000000005522', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005501',
	 '2026-11', 500, now() - interval '7 days');
select pg_temp.spend('00000000-0000-7000-8000-000000005531', '00000000-0000-7000-8000-000000005501', 300, '2026-11-02');
select pg_temp.spend('00000000-0000-7000-8000-000000005532', '00000000-0000-7000-8000-000000005502', 99.99, '2026-11-03');
select pg_temp.spend('00000000-0000-7000-8000-000000005533', '00000000-0000-7000-8000-000000005502', 0.01, '2026-11-04');
-- T Fuel: stopped from this month, so none however much went on it.
insert into public.budgets (id, household_id, category_id, valid_from, amount, created_at) values
	('00000000-0000-7000-8000-000000005512', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005503',
	 '2026-10', 200, now() - interval '9 days'),
	('00000000-0000-7000-8000-000000005513', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005503',
	 '2026-11', null, now() - interval '8 days');
select pg_temp.spend('00000000-0000-7000-8000-000000005534', '00000000-0000-7000-8000-000000005503', 500, '2026-11-05');
-- T Rent: two set for the same month, the later 100; 100 spent this month (last month's doesn't count), so 100%.
insert into public.budgets (id, household_id, category_id, valid_from, amount, created_at) values
	('00000000-0000-7000-8000-000000005514', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005504',
	 '2026-11', 1000, now() - interval '9 days'),
	('00000000-0000-7000-8000-000000005515', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005504',
	 '2026-11', 100, now() - interval '8 days');
select pg_temp.spend('00000000-0000-7000-8000-000000005535', '00000000-0000-7000-8000-000000005504', 100, '2026-11-30');
select pg_temp.spend('00000000-0000-7000-8000-000000005536', '00000000-0000-7000-8000-000000005504', 999, '2026-10-31');
-- T Home: 100; an itemized Expense of 150 counts its Items, 70 against T Home and 80 against T Fuel: 70%, so none.
insert into public.budgets (id, household_id, category_id, valid_from, amount, created_at) values
	('00000000-0000-7000-8000-000000005516', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005505',
	 '2026-11', 100, now() - interval '9 days');
select pg_temp.spend('00000000-0000-7000-8000-000000005537', '00000000-0000-7000-8000-000000005505', 150, '2026-11-06');
insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id) values
	('00000000-0000-7000-8000-000000005541', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005537',
	 0, 'Paint', 70, '00000000-0000-7000-8000-000000005505'),
	('00000000-0000-7000-8000-000000005542', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005537',
	 1, 'Petrol', 80, '00000000-0000-7000-8000-000000005503');

select results_eq(
	$$ select category_name, month, level from private.budget_levels('00000000-0000-7000-8000-0000000055f1', '2026-11-10', 1)
	   order by category_name $$,
	$$ values ('T Food', '2026-11', 80), ('T Rent', '2026-11', 100) $$,
	'Budgets 80% and 100% used, counted as the Budgets tab counts them'
);

-- A Confirm rule due today and one due 3 days ago, both made a while back.
insert into public.recurring_rules (id, household_id, mode, kind, wallet_id, category_id, amount, description, frequency,
	day_of_month, starts_on, created_by, created_at) values
	('00000000-0000-7000-8000-000000005561', '00000000-0000-7000-8000-0000000055f1', 'confirm', 'expense',
	 '00000000-0000-7000-8000-0000000055c1', '00000000-0000-7000-8000-000000005504', 100, 'Flat rent', 'monthly', 10,
	 '2026-01-10', '00000000-0000-4000-8000-0000000055a1', '2026-01-01'),
	('00000000-0000-7000-8000-000000005562', '00000000-0000-7000-8000-0000000055f1', 'confirm', 'expense',
	 '00000000-0000-7000-8000-0000000055c1', '00000000-0000-7000-8000-000000005503', null, ' ', 'monthly', 7,
	 '2026-01-07', '00000000-0000-4000-8000-0000000055a1', '2026-01-01');
-- An open Loan due in 3 days, and one repaid in full.
insert into public.contacts (id, household_id, name) values
	('00000000-0000-7000-8000-000000005571', '00000000-0000-7000-8000-0000000055f1', 'Bilal');
insert into public.loans (id, household_id, contact_id, direction, due_on) values
	('00000000-0000-7000-8000-000000005581', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005571',
	 'lent', '2026-11-13'),
	('00000000-0000-7000-8000-000000005582', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005571',
	 'lent', '2026-11-10');
insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-000000005591', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-0000000055c1',
	 'loan_principal', -1000, '00000000-0000-7000-8000-000000005581', '2026-10-01', '00000000-0000-4000-8000-0000000055a1'),
	('00000000-0000-7000-8000-000000005592', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-0000000055c1',
	 'repayment', 400, '00000000-0000-7000-8000-000000005581', '2026-10-15', '00000000-0000-4000-8000-0000000055a1'),
	('00000000-0000-7000-8000-000000005593', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-0000000055c1',
	 'loan_principal', -500, '00000000-0000-7000-8000-000000005582', '2026-10-01', '00000000-0000-4000-8000-0000000055a1'),
	('00000000-0000-7000-8000-000000005594', '00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-0000000055c1',
	 'repayment', 500, '00000000-0000-7000-8000-000000005582', '2026-10-20', '00000000-0000-4000-8000-0000000055a1');

create function pg_temp.households(as_of timestamptz) returns text[] language sql as $$
	select coalesce(array_agg(f ->> 'householdName' order by f ->> 'householdName')
		filter (where f ->> 'householdName' in ('Family', 'Elsewhere')), '{}')
	from jsonb_array_elements(public.notification_facts(as_of)) f;
$$;
create function pg_temp.facts(as_of timestamptz) returns jsonb language sql as $$
	select coalesce(jsonb_agg(f) filter (where f ->> 'householdName' = 'Family'), '[]'::jsonb)
	from jsonb_array_elements(public.notification_facts(as_of)) f;
$$;

-- 03:00 UTC is 08:00 in Karachi and 22:00 the day before in New York; an hour on, 09:00 and 23:00.
select is(pg_temp.households('2026-11-10 03:00+00'), array['Elsewhere'], 'only households where it''s 09:00 or later');
select is(pg_temp.households('2026-11-10 04:00+00'), array['Elsewhere', 'Family'], 'Karachi from its 09:00');
select is(pg_temp.facts('2026-11-10 04:00+00') -> 0 ->> 'today', '2026-11-10', 'in its own today');
select is(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'members',
	'[{"role": "admin", "userId": "00000000-0000-4000-8000-0000000055a1"}]'::jsonb, 'with its Members');
select is(
	(select jsonb_agg(o ->> 'ruleName' || ' ' || (o ->> 'categoryName') || ' ' || (o ->> 'dueOn') || ' ' || (o ->> 'state')
		order by o ->> 'dueOn')
	 from jsonb_array_elements(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'occurrences') o),
	'["T Fuel T Fuel 2026-11-07 pending", "Flat rent T Rent 2026-11-10 pending"]'::jsonb,
	'its Occurrences due in the last 3 days, named by description, else Category'
);
insert into public.occurrences (id, household_id, rule_id, due_on, state, snoozed_until)
select (private.occurrence_ids('00000000-0000-7000-8000-000000005562', '2026-11-07')).occurrence_id,
	'00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005562', '2026-11-07', 'snoozed', '2026-11-12';
select is(
	(select o ->> 'state' from jsonb_array_elements(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'occurrences') o
	 where o ->> 'dueOn' = '2026-11-07'),
	'snoozed', 'one snoozed past today isn''t Pending'
);
-- Snoozed long ago to today: back to Pending today, and so among today's.
insert into public.occurrences (id, household_id, rule_id, due_on, state, snoozed_until)
select (private.occurrence_ids('00000000-0000-7000-8000-000000005561', '2026-10-10')).occurrence_id,
	'00000000-0000-7000-8000-0000000055f1', '00000000-0000-7000-8000-000000005561', '2026-10-10', 'snoozed', '2026-11-10';
select is(
	(select (o ->> 'state') || ' ' || (o ->> 'snoozedUntil') from jsonb_array_elements(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'occurrences') o
	 where o ->> 'dueOn' = '2026-10-10'),
	'pending 2026-11-10', 'one whose snooze ends today is Pending again'
);
select is(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'loans',
	'[{"dueOn": "2026-11-13", "loanId": "00000000-0000-7000-8000-000000005581", "contactName": "Bilal", "direction": "lent"}]'::jsonb,
	'its Loans still owed, due within 3 days, never one repaid');
select is(jsonb_array_length(pg_temp.facts('2026-11-10 04:00+00') -> 0 -> 'budgets'), 2, 'and its Budgets passed');
select is(
	(select jsonb_agg((b ->> 'categoryName') || ' ' || (b ->> 'month') order by b ->> 'categoryName')
	 from jsonb_array_elements(pg_temp.facts('2026-12-01 04:00+00') -> 0 -> 'budgets') b),
	'["T Food 2026-11", "T Rent 2026-11"]'::jsonb,
	'on a Budget month''s first day, last month''s too, so a crossing late on its last day isn''t lost'
);

-- Raising: once only by dedupe key, and only to someone in the household.
create function pg_temp.raise(user_id uuid, dedupe_key text) returns integer language sql as $$
	select public.raise_notifications(jsonb_build_array(jsonb_build_object(
		'household_id', '00000000-0000-7000-8000-0000000055f1', 'user_id', user_id, 'trigger', 'loan_due',
		'payload', '{"householdName":"Family"}', 'dedupe_key', dedupe_key)));
$$;
create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000055a1');
select throws_ok($$ select public.notification_facts(now()) $$, '42501', null, 'gathering is the service role''s');
select throws_ok($$ select pg_temp.raise('00000000-0000-4000-8000-0000000055a1', 'k1') $$, '42501', null,
	'and so is raising');
reset role;
set local role service_role;
select is(pg_temp.raise('00000000-0000-4000-8000-0000000055a1', 'loan_due/x/2026-11-10'), 1, 'a Notification is raised');
select is(pg_temp.raise('00000000-0000-4000-8000-0000000055a1', 'loan_due/x/2026-11-10'), 0, 'but only once');
select is(pg_temp.raise('00000000-0000-4000-8000-0000000055a2', 'loan_due/x/2026-11-10'), 0,
	'and never to someone outside the household');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000055a1');
select throws_ok(
	$$ update public.notifications set dedupe_key = 'other' where dedupe_key = 'loan_due/x/2026-11-10' $$,
	'42501', null, 'a User can''t rewrite what a Notification is'
);
reset role;

select * from finish();
rollback;
