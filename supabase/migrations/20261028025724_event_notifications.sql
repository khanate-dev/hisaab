-- Event notifications (spec §3.5; issue #9's table; #62): Recurring due, Auto-recorded, Budget threshold and Loan due,
-- raised at 09:00 household time by `raise-notifications`, which pg_cron calls hourly. The database gathers what each
-- household at 09:00 has to go on (`notification_facts`, its sums exact in numeric); the domain package decides what
-- to raise and to whom (`scheduledNotifications`); each is raised once, by its dedupe key. Push follows as for any
-- Notification (`deliver_by_push`). Expand-only: a column, functions and a job.

-- What a Notification is once only: its trigger and what it's about ("budget_threshold/<category>/<month>/80").
alter table public.notifications add column dedupe_key text check (char_length(dedupe_key) <= 300);
create unique index notifications_dedupe_key_idx on public.notifications (user_id, dedupe_key)
	where dedupe_key is not null;

-- Its dedupe key is as raised too.
create or replace function private.keep_notification_as_raised() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if (select auth.uid()) is not null and (row(new.id, new.household_id, new.user_id, new.trigger, new.subject_user_id,
		new.payload, new.created_at, new.dedupe_key) is distinct from row(old.id, old.household_id, old.user_id,
		old.trigger, old.subject_user_id, old.payload, old.created_at, old.dedupe_key)) then
		raise exception 'Only whether a Notification is read changes' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- The first day of the Budget month a date falls in, as `budgetMonthOf` and `budgetMonthRange` have it.
create function private.budget_month_start(day date, start_day integer) returns date
language sql immutable
set search_path = ''
as $$
	select case
		when extract(day from day)::integer >= start_day
			then make_date(extract(year from day)::integer, extract(month from day)::integer, start_day)
		else (make_date(extract(year from day)::integer, extract(month from day)::integer, start_day)
			- interval '1 month')::date
	end;
$$;
revoke all on function private.budget_month_start(date, integer) from public;

-- Each expense Budget of a household's current Budget month that's 80% or 100% used, as the Budgets tab counts it
-- (`budgetMonthView`): the month's override, else the standing amount valid from the latest month not after it, the
-- one written last winning; used is what its Expenses and Incomes came to that month, an itemized Expense counting each
-- Item against its own Category and a parent counting its Subcategories'. A zero Budget, or a stopped one, has none.
create function private.budget_levels(target_household uuid, today date, start_day integer)
returns table (category_id uuid, category_name text, month text, level integer)
language sql stable security definer
set search_path = ''
as $$
	with span as (
		select private.budget_month_start(today, start_day) as first
	), bounds as (
		select first, ((first + interval '1 month')::date - 1) as last, to_char(first, 'YYYY-MM') as month from span
	), flows as (
		select e.id, e.amount, e.category_id from public.entries e, bounds b
		where e.household_id = target_household and e.kind in ('expense', 'income')
			and e.occurred_on between b.first and b.last
	), counted as (
		select i.category_id, abs(i.amount) as amount
		from public.entry_items i join flows f on f.id = i.entry_id
		union all
		select f.category_id, abs(f.amount) from flows f
		where f.category_id is not null and not exists (select 1 from public.entry_items i where i.entry_id = f.id)
	), own as (
		select counted.category_id, sum(counted.amount) as amount from counted group by counted.category_id
	), budgeted as (
		select c.id, c.name, b.month,
			case
				when exists (select 1 from public.budget_overrides o where o.category_id = c.id and o.month = b.month)
					then (select o.amount from public.budget_overrides o where o.category_id = c.id and o.month = b.month
						order by o.created_at desc limit 1)
				else (select s.amount from public.budgets s where s.category_id = c.id and s.valid_from <= b.month
					order by s.valid_from desc, s.created_at desc limit 1)
			end as budget,
			coalesce((select own.amount from own where own.category_id = c.id), 0)
				+ coalesce((select sum(own.amount) from own join public.categories sub on sub.id = own.category_id
					where sub.parent_id = c.id), 0) as used
		from public.categories c, bounds b
		where c.household_id = target_household and c.kind = 'expense' and c.archived_at is null
	)
	select id, name, month, case when used >= budget then 100 else 80 end
	from budgeted
	where budget > 0 and used * 5 >= budget * 4;
$$;
revoke all on function private.budget_levels(uuid, date, integer) from public;

-- The same, for the harness's check that SQL and the domain agree; the service role's only.
create function public.budget_levels(target_household uuid, today date, start_day integer)
returns table (category_id uuid, category_name text, month text, level integer)
language sql stable security definer
set search_path = ''
as $$
	select * from private.budget_levels(target_household, today, start_day);
$$;
revoke all on function public.budget_levels(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.budget_levels(uuid, date, integer) to service_role;

-- What each household where it's 09:00 or later has to go on, for `scheduledNotifications` (later hours catch up a run
-- that failed; raising once by dedupe key makes the rest harmless): its Members; its Recurring rules' Occurrences due
-- in the last 3 days (from the day each rule was made, as Auto-record has it) or whose snooze ends today, Pending or as
-- handled; its open Loans due within 3 days or overdue; and its Budgets 80% or 100% used, last month's too on a Budget
-- month's first day (so a crossing late on its last day isn't lost). Names only, never an amount. The service role's
-- only.
create function public.notification_facts(as_of timestamptz) returns jsonb
language sql stable security definer
set search_path = ''
as $$
	with here as (
		select h.id, h.name, h.budget_month_start_day as start_day, (as_of at time zone h.timezone)::date as today
		from public.households h
		where h.timezone is not null and extract(hour from (as_of at time zone h.timezone)) >= 9
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'householdId', here.id,
		'householdName', here.name,
		'today', to_char(here.today, 'YYYY-MM-DD'),
		'members', (
			select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role)), '[]'::jsonb)
			from public.memberships m where m.household_id = here.id
		),
		'occurrences', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'ruleId', r.id,
				'mode', r.mode,
				'createdBy', r.created_by,
				-- Free text, which may hold a figure: for the inbox only, never push.
				'ruleName', coalesce(nullif(btrim(r.description), ''), c.name),
				'categoryName', c.name,
				'dueOn', to_char(due.due_on, 'YYYY-MM-DD'),
				'state', case
					when o.id is null or (o.state = 'snoozed' and o.snoozed_until <= here.today) then 'pending'
					else o.state
				end,
				'snoozedUntil', to_char(o.snoozed_until, 'YYYY-MM-DD')
			)), '[]'::jsonb)
			from (
				select r.id as rule_id, d.due_on
				from public.recurring_rules r
				cross join lateral private.schedule_dates(r.frequency, r.interval, r.day_of_month, r.starts_on, r.ends_on,
					greatest(r.starts_on, (r.created_at at time zone 'UTC')::date, here.today - 3), here.today) as d(due_on)
				where r.household_id = here.id
				union
				select s.rule_id, s.due_on from public.occurrences s
				where s.household_id = here.id and s.state = 'snoozed' and s.snoozed_until = here.today
			) as due
			join public.recurring_rules r on r.id = due.rule_id
			join public.categories c on c.id = r.category_id and c.household_id = r.household_id
			left join public.occurrences o on o.rule_id = r.id and o.due_on = due.due_on
		),
		'loans', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'loanId', l.id,
				'contactName', ct.name,
				'direction', l.direction,
				'dueOn', to_char(l.due_on, 'YYYY-MM-DD')
			)), '[]'::jsonb)
			from public.loans l
			join public.contacts ct on ct.id = l.contact_id and ct.household_id = l.household_id
			where l.household_id = here.id and l.written_off_at is null and l.due_on is not null
				and l.due_on <= here.today + 3
				-- Still owed (`loanOutstanding`): Lent comes back, Borrowed goes back.
				and (select case when l.direction = 'lent' then -coalesce(sum(e.amount), 0) else coalesce(sum(e.amount), 0) end
					from public.entries e where e.loan_id = l.id) > 0
		),
		'budgets', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'categoryId', b.category_id,
				'categoryName', b.category_name,
				'month', b.month,
				'level', b.level
			)), '[]'::jsonb)
			from (
				select * from private.budget_levels(here.id, here.today, here.start_day)
				union all
				select * from private.budget_levels(here.id, here.today - 1, here.start_day)
				where private.budget_month_start(here.today, here.start_day) = here.today
			) as b
		)
	)), '[]'::jsonb)
	from here;
$$;
revoke all on function public.notification_facts(timestamptz) from public, anon, authenticated;
grant execute on function public.notification_facts(timestamptz) to service_role;

-- Raises what `scheduledNotifications` decided: each to someone still in its household, and once only, by its dedupe
-- key. Answers with how many were new. The service role's only.
create function public.raise_notifications(raised jsonb) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	added integer;
begin
	insert into public.notifications (household_id, user_id, trigger, payload, dedupe_key)
	select r.household_id, r.user_id, r.trigger, r.payload, r.dedupe_key
	from jsonb_to_recordset(raised) as r(household_id uuid, user_id uuid, trigger text, payload text, dedupe_key text)
	where r.dedupe_key is not null
		and exists (select 1 from public.memberships m where m.household_id = r.household_id and m.user_id = r.user_id)
	on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
	get diagnostics added = row_count;
	return added;
end;
$$;
revoke all on function public.raise_notifications(jsonb) from public, anon, authenticated;
grant execute on function public.raise_notifications(jsonb) to service_role;

-- Calls `raise-notifications` when the project's URL and service key are in Vault (as `request_dispatch` does).
create function private.request_scheduled_notifications() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
	service_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
	if project_url is null or service_key is null then
		return;
	end if;
	perform net.http_post(
		url := project_url || '/functions/v1/raise-notifications',
		headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
		body := '{}'::jsonb,
		timeout_milliseconds := 60000
	);
end;
$$;
revoke all on function private.request_scheduled_notifications() from public;

-- Hourly, a little after the hour, so each household is reached in its own 09:00 (and, should a run fail, the next).
select cron.schedule('raise-notifications', '2 * * * *', 'select private.request_scheduled_notifications()');
