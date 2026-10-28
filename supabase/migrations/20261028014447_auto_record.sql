-- Auto-record (spec §3.3, ADR-0004, #49): an Auto-record rule's Occurrence becomes an Entry on its due date without
-- anyone opening the app. An hourly job records what's due in each household's own today, under the same derived ids
-- every device uses (`occurrenceId`, `occurrenceEntryId`), so a device that already recorded it merges instead of
-- duplicating. Like the devices, it records only from the day the rule was made; anything back-dated stays Pending.
-- Expand-only: new functions and a job.

-- A rule's due dates from `from_day` to `to_day`, both included, as `dueDates` in packages/domain/src/recurring.ts has
-- them: monthly on its day (a shorter month's last day), weekly on the start's weekday, yearly on the start's day,
-- every `interval` of them, within its start and end.
create function private.due_dates(rule public.recurring_rules, from_day date, to_day date) returns setof date
language plpgsql immutable
set search_path = ''
as $$
declare
	last_day date := least(to_day, coalesce(rule.ends_on, to_day));
	n integer := 0;
	due date;
	month_index integer;
	year integer;
	month integer;
	day integer;
begin
	loop
		if rule.frequency = 'weekly' then
			due := rule.starts_on + 7 * rule.interval * n;
		else
			if rule.frequency = 'monthly' then
				month_index := extract(year from rule.starts_on)::integer * 12 + extract(month from rule.starts_on)::integer - 1
					+ rule.interval * n;
				year := month_index / 12;
				month := month_index % 12 + 1;
				day := rule.day_of_month;
			else
				year := extract(year from rule.starts_on)::integer + rule.interval * n;
				month := extract(month from rule.starts_on)::integer;
				day := extract(day from rule.starts_on)::integer;
			end if;
			due := make_date(year, month, least(day, extract(day from
				(make_date(year, month, 1) + interval '1 month - 1 day'))::integer));
		end if;
		exit when due > last_day;
		if due >= rule.starts_on and due >= from_day then
			return next due;
		end if;
		n := n + 1;
	end loop;
end;
$$;
revoke all on function private.due_dates(public.recurring_rules, date, date) from public;

-- Records every Auto-record Occurrence due by its household's today that nothing has been done with: the Occurrence,
-- then its Entry, recorded by the rule's maker. Returns how many it recorded.
create function private.auto_record() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	namespace constant uuid := '6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f';
	recorded integer := 0;
	rule public.recurring_rules;
	today date;
	due date;
	occurrence_id uuid;
	entry_id uuid;
begin
	for rule in
		select r.* from public.recurring_rules r
		where r.mode = 'auto' and r.amount is not null
	loop
		select (now() at time zone coalesce(h.timezone, 'UTC'))::date into today
		from public.households h where h.id = rule.household_id;
		-- From the day the rule was made, in the household's time, as the devices do.
		for due in
			select d from private.due_dates(rule,
				greatest(rule.starts_on, (rule.created_at at time zone 'UTC')::date), today) as d
		loop
			occurrence_id := extensions.uuid_generate_v5(namespace, format('occurrence/%s/%s', rule.id, due));
			entry_id := extensions.uuid_generate_v5(namespace, format('entry/%s/%s', rule.id, due));
			continue when exists (select 1 from public.occurrences where id = occurrence_id);
			-- One the database refuses (say, its Category archived since) is left Pending; the rest still go.
			begin
				insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
				values (occurrence_id, rule.household_id, rule.id, due, 'confirmed', entry_id)
				on conflict (id) do nothing;
				insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on,
					description, created_by)
				values (entry_id, rule.household_id, rule.wallet_id, rule.kind,
					case when rule.kind = 'expense' then -rule.amount else rule.amount end,
					rule.category_id, due, rule.description, rule.created_by)
				on conflict (id) do nothing;
				recorded := recorded + 1;
			exception when others then
				raise warning 'Auto-record left % of rule % Pending: %', due, rule.id, sqlerrm;
			end;
		end loop;
	end loop;
	return recorded;
end;
$$;
revoke all on function private.auto_record() from public;

select cron.schedule('auto-record', '7 * * * *', 'select private.auto_record()');
