-- Auto-record: the hourly job records an Auto-record rule's due Occurrences as Entries under the derived ids, once,
-- from the day the rule was made, never one already done with, never a Confirm rule's, and leaves one the database
-- refuses Pending without stopping the rest. Its due dates are the domain's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000022a1', 'maker@example.com');
insert into public.households (id, name, timezone) values ('00000000-0000-7000-8000-0000000022f1', 'Family', 'Asia/Karachi');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000022e1', '00000000-0000-7000-8000-0000000022f1', '00000000-0000-4000-8000-0000000022a1', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000022c1', '00000000-0000-7000-8000-0000000022f1', 'Cash', 'cash', 'PKR');

create function pg_temp.dates(frequency text, every int, day int, starts date, ends date, from_day date, to_day date)
returns setof date language sql as $$
	select * from private.due_dates(row('00000000-0000-7000-8000-000000002201'::uuid, '00000000-0000-7000-8000-0000000022f1'::uuid,
		'auto', 'expense', '00000000-0000-7000-8000-0000000022c1'::uuid, '00000000-0000-7000-8000-0000000022c1'::uuid, 1, null,
		frequency, every, day, starts, ends, '00000000-0000-4000-8000-0000000022a1'::uuid, now())::public.recurring_rules,
		from_day, to_day);
$$;

select results_eq($$ select * from pg_temp.dates('monthly', 1, 31, '2026-01-15', null, '2026-01-01', '2026-04-30') $$,
	array['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']::date[], 'monthly on the 31st falls on each month''s last day');
select results_eq($$ select * from pg_temp.dates('monthly', 2, 1, '2026-01-01', '2026-06-30', '2026-01-01', '2026-12-31') $$,
	array['2026-01-01', '2026-03-01', '2026-05-01']::date[], 'every other month, until its end');
select results_eq($$ select * from pg_temp.dates('weekly', 2, null, '2026-10-01', null, '2026-10-01', '2026-10-31') $$,
	array['2026-10-01', '2026-10-15', '2026-10-29']::date[], 'every other week on the start''s weekday');
select results_eq($$ select * from pg_temp.dates('yearly', 1, null, '2024-02-29', null, '2024-01-01', '2026-12-31') $$,
	array['2024-02-29', '2025-02-28', '2026-02-28']::date[], 'yearly on the 29th of February, the 28th in other years');

-- Rules made a while back: Rent auto-recorded from the 1st, Utilities to confirm, Old auto with an archived Category.
insert into public.recurring_rules (id, household_id, mode, kind, wallet_id, category_id, amount, frequency, day_of_month,
	starts_on, created_by, created_at) values
	('00000000-0000-7000-8000-000000002211', '00000000-0000-7000-8000-0000000022f1', 'auto', 'expense',
	 '00000000-0000-7000-8000-0000000022c1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000022f1' and name = 'Rent'),
	 50000, 'monthly', 1, current_date - 70, '00000000-0000-4000-8000-0000000022a1', now() - interval '40 days'),
	('00000000-0000-7000-8000-000000002212', '00000000-0000-7000-8000-0000000022f1', 'confirm', 'expense',
	 '00000000-0000-7000-8000-0000000022c1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000022f1' and name = 'Utilities'),
	 3000, 'monthly', 1, current_date - 70, '00000000-0000-4000-8000-0000000022a1', now() - interval '40 days'),
	('00000000-0000-7000-8000-000000002213', '00000000-0000-7000-8000-0000000022f1', 'auto', 'expense',
	 '00000000-0000-7000-8000-0000000022c1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000022f1' and name = 'Fuel'),
	 100, 'weekly', null, current_date - 20, '00000000-0000-4000-8000-0000000022a1', now() - interval '20 days');
update public.categories set archived_at = now()
where household_id = '00000000-0000-7000-8000-0000000022f1' and name = 'Fuel';

create function pg_temp.rent_dates() returns setof date language sql as $$
	select * from private.due_dates((select r from public.recurring_rules r where id = '00000000-0000-7000-8000-000000002211'),
		greatest(current_date - 70, (now() - interval '40 days')::date), (now() at time zone 'Asia/Karachi')::date);
$$;

select lives_ok($$ select private.auto_record() $$, 'the job runs, one refusal not stopping the rest');
select is((select count(*)::int from public.entries where household_id = '00000000-0000-7000-8000-0000000022f1'
	and kind = 'expense' and category_id = (select category_id from public.recurring_rules where id = '00000000-0000-7000-8000-000000002211')),
	(select count(*)::int from pg_temp.rent_dates()),
	'every due Rent since the rule was made is recorded, nothing back-dated before it');
select ok((select count(*) from pg_temp.rent_dates()) > 0, 'and there was some');
select is(
	(select string_agg(e.id::text, ',' order by e.occurred_on) from public.entries e
	 where e.category_id = (select category_id from public.recurring_rules where id = '00000000-0000-7000-8000-000000002211')),
	(select string_agg(extensions.uuid_generate_v5('6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f',
		format('entry/%s/%s', '00000000-0000-7000-8000-000000002211', d))::text, ',' order by d) from pg_temp.rent_dates() as d),
	'under the ids every device derives'
);
select is((select count(*)::int from public.occurrences where rule_id = '00000000-0000-7000-8000-000000002212'), 0,
	'a Confirm rule''s Occurrences stay Pending');
select is((select count(*)::int from public.occurrences where rule_id = '00000000-0000-7000-8000-000000002213'), 0,
	'one the database refuses stays Pending');
select is(private.auto_record(), 0, 'a second run records nothing more');
select is((select created_by from public.entries
	where category_id = (select category_id from public.recurring_rules where id = '00000000-0000-7000-8000-000000002211') limit 1),
	'00000000-0000-4000-8000-0000000022a1'::uuid, 'recorded by the rule''s maker');

select * from finish();
rollback;
