-- Auto-record (spec §3.3, ADR-0004, #49): an Auto-record rule's Occurrence becomes an Entry on its due date without
-- anyone opening the app. An hourly job records what's due in each household's own today, under the same derived ids
-- every device uses (`occurrenceId`, `occurrenceEntryId`), so a device that already recorded it merges instead of
-- duplicating. Like the devices, it records only from the day the rule was made; anything back-dated stays Pending.
-- Expand-only: new functions and a job, and the Occurrence id check's dates spelled out.

-- A schedule's due dates from `from_day` to `to_day`, both included, exactly as `dueDates` in
-- packages/domain/src/recurring.ts has them (the harness checks the two agree): monthly on its day (a shorter month's
-- last day), weekly on the start's weekday, yearly on the start's day, every `every` of them, within start and end.
create function private.schedule_dates(
	frequency text, every integer, day_of_month integer, starts_on date, ends_on date, from_day date, to_day date
) returns setof date
language plpgsql immutable
set search_path = ''
as $$
declare
	last_day date := least(to_day, coalesce(ends_on, to_day));
	n integer := 0;
	due date;
	month_index integer;
	year integer;
	month integer;
	day integer;
begin
	if every is null or every < 1 then
		raise exception 'A schedule repeats every 1 or more' using errcode = '22023';
	end if;
	loop
		if frequency = 'weekly' then
			due := starts_on + 7 * every * n;
		else
			if frequency = 'monthly' then
				month_index := extract(year from starts_on)::integer * 12 + extract(month from starts_on)::integer - 1
					+ every * n;
				year := month_index / 12;
				month := month_index % 12 + 1;
				day := day_of_month;
			else
				year := extract(year from starts_on)::integer + every * n;
				month := extract(month from starts_on)::integer;
				day := extract(day from starts_on)::integer;
			end if;
			due := make_date(year, month, least(day, extract(day from
				(make_date(year, month, 1) + interval '1 month - 1 day'))::integer));
		end if;
		exit when due > last_day;
		if due >= starts_on and due >= from_day then
			return next due;
		end if;
		n := n + 1;
	end loop;
end;
$$;
revoke all on function private.schedule_dates(text, integer, integer, date, date, date, date) from public;

-- The same, for the harness's check that SQL and the domain agree; the service role's only.
create function public.schedule_dates(
	frequency text, every integer, day_of_month integer, starts_on date, ends_on date, from_day date, to_day date
) returns setof date
language sql immutable security definer
set search_path = ''
as $$
	select private.schedule_dates(frequency, every, day_of_month, starts_on, ends_on, from_day, to_day);
$$;
revoke all on function public.schedule_dates(text, integer, integer, date, date, date, date) from public, anon, authenticated;
grant execute on function public.schedule_dates(text, integer, integer, date, date, date, date) to service_role;

-- An Occurrence's ids, spelled exactly as the domain spells them (a date always as YYYY-MM-DD, whatever DateStyle).
create function private.occurrence_ids(rule_id uuid, due_on date, out occurrence_id uuid, out entry_id uuid)
language sql immutable
set search_path = ''
as $$
	select
		extensions.uuid_generate_v5('6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f',
			'occurrence/' || rule_id::text || '/' || to_char(due_on, 'YYYY-MM-DD')),
		extensions.uuid_generate_v5('6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f',
			'entry/' || rule_id::text || '/' || to_char(due_on, 'YYYY-MM-DD'));
$$;
revoke all on function private.occurrence_ids(uuid, date) from public;

create or replace function private.keep_occurrence_ids_derived() returns trigger
language plpgsql
set search_path = ''
as $$
declare
	ids record := private.occurrence_ids(new.rule_id, new.due_on);
begin
	if new.id is distinct from ids.occurrence_id
		or (new.entry_id is not null and new.entry_id is distinct from ids.entry_id) then
		raise exception 'An Occurrence''s ids come from its rule and due date' using errcode = '23514';
	end if;
	return new;
end;
$$;

-- How far back the hourly job looks: it runs every hour, so anything older was recorded then (or, if it was down,
-- is left Pending for the devices to show, rather than replayed without end).
create function private.auto_record() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	recorded integer := 0;
	inserted integer;
	rule record;
	due record;
begin
	for rule in
		select r.*, (now() at time zone h.timezone)::date as today
		from public.recurring_rules r
		join public.households h on h.id = r.household_id
		join public.categories c on c.id = r.category_id and c.household_id = r.household_id
		join public.wallets w on w.id = r.wallet_id and w.household_id = r.household_id
		where r.mode = 'auto' and r.amount is not null
			-- No timezone yet: each device records in its own today instead (`entryTimeZone`).
			and h.timezone is not null
			-- Never anything the database would refuse every hour: an archived Category or Wallet.
			and c.archived_at is null and w.archived_at is null
			-- Recorded in its maker's name, so only while they may still write there.
			and exists (select 1 from public.memberships m
				where m.household_id = r.household_id and m.user_id = r.created_by and m.role in ('admin', 'member'))
	loop
		-- From the day the rule was made (the UTC date, as the devices read `created_at`), at most 62 days back.
		for due in
			select d.due_on, ids.occurrence_id, ids.entry_id
			from private.schedule_dates(rule.frequency, rule.interval, rule.day_of_month, rule.starts_on, rule.ends_on,
				greatest(rule.starts_on, (rule.created_at at time zone 'UTC')::date, rule.today - 62), rule.today)
				as d(due_on),
				lateral private.occurrence_ids(rule.id, d.due_on) as ids
			where not exists (select 1 from public.occurrences o where o.id = ids.occurrence_id)
		loop
			begin
				insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
				values (due.occurrence_id, rule.household_id, rule.id, due.due_on, 'confirmed', due.entry_id)
				on conflict (id) do nothing;
				get diagnostics inserted = row_count;
				-- A device's own (a skip, a snooze, a confirm) landed meanwhile: it speaks for this one.
				continue when inserted = 0;
				insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on,
					description, created_by)
				values (due.entry_id, rule.household_id, rule.wallet_id, rule.kind,
					case when rule.kind = 'expense' then -rule.amount else rule.amount end,
					rule.category_id, due.due_on, rule.description, rule.created_by)
				on conflict (id) do nothing;
				recorded := recorded + 1;
			exception when others then
				-- One refused for another reason is left Pending; the rest still go.
				raise warning 'Auto-record left % of rule % Pending: %', due.due_on, rule.id, sqlerrm;
			end;
		end loop;
	end loop;
	return recorded;
end;
$$;
revoke all on function private.auto_record() from public;

select cron.schedule('auto-record', '7 * * * *', 'select private.auto_record()');
