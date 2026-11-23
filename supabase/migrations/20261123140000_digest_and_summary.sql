-- The Household activity digest and the Monthly summary (spec §3.5; issue #9's table; #63). `raise-notifications`,
-- hourly, now also raises:
-- - the digest at 20:00 household time, to each Member who opted in, of others' changes over the day before;
-- - the Monthly summary at 09:00 on a Budget month's first day, about the month just gone, to everyone in the
--   household; whoever opted in to its email also gets an email delivery, which `dispatch-notifications` sends through
--   Resend with the figures it reads then (`monthly_summary_figures`), exact in numeric.
-- Notifications carry names only, never an amount; only the email has figures. Expand-only: functions and a trigger.

-- Each household at or past its 20:00: who opted in to the digest, and who changed what over the 24 hours before its
-- 20:00 today (changes made together count once). The service role's only.
create function public.digest_facts(as_of timestamptz) returns jsonb
language sql stable security definer
set search_path = ''
as $$
	with here as (
		-- From yesterday's 20:00 to today's, each in the household's own time (a DST day is 23 or 25 hours).
		select h.id, h.name, (as_of at time zone h.timezone)::date as today,
			((as_of at time zone h.timezone)::date - 1 + time '20:00') at time zone h.timezone as since,
			((as_of at time zone h.timezone)::date + time '20:00') at time zone h.timezone as until
		from public.households h
		where h.timezone is not null and extract(hour from (as_of at time zone h.timezone)) >= 20
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'householdId', here.id,
		'householdName', here.name,
		'today', to_char(here.today, 'YYYY-MM-DD'),
		'optedIn', (
			select coalesce(jsonb_agg(m.user_id), '[]'::jsonb)
			from public.memberships m
			join public.notification_preferences p
				on p.household_id = m.household_id and p.user_id = m.user_id and p.trigger = 'household_activity'
			where m.household_id = here.id and p.enabled
		),
		'changes', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'actorId', a.actor_id,
				'actorName', coalesce(pr.display_name, 'Someone'),
				'count', a.count
			)), '[]'::jsonb)
			from (
				select l.actor_id, count(distinct l.transaction_id)::integer as count
				from public.activity_log l
				where l.household_id = here.id and l.actor_id is not null
					and l.synced_at >= here.since and l.synced_at < here.until
				group by l.actor_id
			) as a
			left join public.profiles pr on pr.id = a.actor_id
		)
	)), '[]'::jsonb)
	from here;
$$;
revoke all on function public.digest_facts(timestamptz) from public, anon, authenticated;
grant execute on function public.digest_facts(timestamptz) to service_role;

-- Each household at or past its 09:00 on a Budget month's first day: the month just gone and everyone in it. The
-- service role's only.
create function public.summary_facts(as_of timestamptz) returns jsonb
language sql stable security definer
set search_path = ''
as $$
	with here as (
		select h.id, h.name, (as_of at time zone h.timezone)::date as today, h.budget_month_start_day as start_day
		from public.households h
		where h.timezone is not null and extract(hour from (as_of at time zone h.timezone)) >= 9
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'householdId', here.id,
		'householdName', here.name,
		'month', to_char(here.today - interval '1 month', 'YYYY-MM'),
		'members', (
			select coalesce(jsonb_agg(m.user_id), '[]'::jsonb)
			from public.memberships m where m.household_id = here.id
		)
	)), '[]'::jsonb)
	from here
	where private.budget_month_start(here.today, here.start_day) = here.today;
$$;
revoke all on function public.summary_facts(timestamptz) from public, anon, authenticated;
grant execute on function public.summary_facts(timestamptz) to service_role;

-- A Monthly summary also goes by email to whoever opted in to it there (#13: off by default), at their account's
-- address.
create function private.deliver_by_email() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.trigger = 'monthly_summary' and exists (
		select 1 from public.notification_preferences p
		where p.user_id = new.user_id and p.household_id = new.household_id and p.trigger = 'monthly_summary'
			and p.email_enabled
	) then
		insert into public.notification_deliveries (notification_id, user_id, channel, target)
		select new.id, new.user_id, 'email', u.email
		from auth.users u where u.id = new.user_id and u.email is not null
		on conflict (notification_id, channel, target) do nothing;
	end if;
	return null;
end;
$$;
revoke all on function private.deliver_by_email() from public;
create trigger deliver_by_email after insert on public.notifications
	for each row execute function private.deliver_by_email();

-- What a Monthly summary's email says: the Budget month's Incomes and Expenses in the Base currency (each Entry's Base
-- amount where it has one; one in another currency still waiting for its rate isn't counted, as in the reports), what
-- was left, and the five top-level Categories it spent most on (an itemized Expense's Items each against their own
-- Category, a Subcategory's under its parent, its Base amount shared in proportion with the last Item taking what
-- rounding leaves, as `itemBaseShares` does).
-- Null when the Notification isn't a summary or the household has no Base currency yet. The service role's only.
create function public.monthly_summary_figures(notification uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
	with what as (
		select n.household_id, h.name, h.base_currency as currency, h.budget_month_start_day as start_day,
			n.payload::jsonb ->> 'month' as month
		from public.notifications n join public.households h on h.id = n.household_id
		where n.id = notification and n.trigger = 'monthly_summary' and h.base_currency is not null
	), span as (
		select what.*, private.currency_decimals(what.currency) as decimals,
			make_date(split_part(month, '-', 1)::integer, split_part(month, '-', 2)::integer, start_day) as first
		from what where month ~ '^\d{4}-\d{2}$'
	), bounds as (
		select span.*, ((first + interval '1 month')::date - 1) as last from span
	), flows as (
		select e.id, e.kind, e.amount, case when e.base_rate is null then e.amount else e.base_amount end as base,
			e.category_id
		from public.entries e, bounds b
		where e.household_id = b.household_id and e.kind in ('expense', 'income')
			and e.occurred_on between b.first and b.last
			and (e.base_rate is null or e.base_amount is not null)
	), spent as (
		-- An Expense's Items, each its share of the Base amount; an Expense without Items, whole.
		select shares.category_id,
			case when shares.last then abs(shares.base) - coalesce(shares.before, 0) else shares.share end as amount
		from (
			select i.category_id, f.base,
				row_number() over (partition by f.id order by i.position desc) = 1 as last,
				sum(shares.share) over (partition by f.id order by i.position rows between unbounded preceding and 1 preceding)
					as before,
				shares.share
			from flows f
			join public.entry_items i on i.entry_id = f.id
			cross join lateral (
				select case when f.amount = 0 then 0
					else round(abs(i.amount) * abs(f.base) / abs(f.amount), (select decimals from bounds)) end as share
			) as shares
			where f.kind = 'expense'
		) as shares
		union all
		select f.category_id, abs(f.base) from flows f
		where f.kind = 'expense' and f.category_id is not null
			and not exists (select 1 from public.entry_items i where i.entry_id = f.id)
	), top as (
		select coalesce(p.name, c.name) as name, sum(s.amount) as amount
		from spent s
		join public.categories c on c.id = s.category_id
		left join public.categories p on p.id = c.parent_id
		group by coalesce(p.id, c.id), coalesce(p.name, c.name)
		order by sum(s.amount) desc, coalesce(p.name, c.name)
		limit 5
	), totals as (
		select coalesce(sum(abs(base)) filter (where kind = 'income'), 0) as income,
			coalesce(sum(abs(base)) filter (where kind = 'expense'), 0) as expense
		from flows
	)
	select jsonb_build_object(
		'householdName', b.name,
		'month', b.month,
		'first', to_char(b.first, 'YYYY-MM-DD'),
		'last', to_char(b.last, 'YYYY-MM-DD'),
		'currency', b.currency,
		'decimals', b.decimals,
		'income', trim_scale(t.income)::text,
		'expense', trim_scale(t.expense)::text,
		'net', trim_scale(t.income - t.expense)::text,
		'categories', (
			select coalesce(jsonb_agg(jsonb_build_object('name', top.name, 'amount', trim_scale(top.amount)::text)
				order by top.amount desc, top.name), '[]'::jsonb)
			from top
		)
	)
	from bounds b, totals t;
$$;
revoke all on function public.monthly_summary_figures(uuid) from public, anon, authenticated;
grant execute on function public.monthly_summary_figures(uuid) to service_role;
