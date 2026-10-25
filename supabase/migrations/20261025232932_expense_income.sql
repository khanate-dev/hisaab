-- Expense and Income (spec §3.3): Entries with a Category, notes and an optional time, dated in the household's
-- timezone. Expand-only: the kind check is widened (every existing row still passes it), columns are added nullable,
-- and new rules only constrain the new kinds.

-- The household's timezone (IANA), which Entry dates are in. Null until set; devices then use their own.
alter table public.households add column timezone text check (char_length(timezone) between 1 and 64);

create function private.check_household_timezone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
		raise exception 'Unknown timezone %', new.timezone using errcode = '22023';
	end if;
	return new;
end;
$$;
revoke all on function private.check_household_timezone() from public;
create trigger check_household_timezone
	before insert or update of timezone on public.households
	for each row execute function private.check_household_timezone();

alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
	check (kind in ('balance_adjustment', 'expense', 'income'));

alter table public.entries
	add column category_id uuid,
	-- Wall-clock time in the household's timezone, HH:MM; most Entries have only a date.
	add column occurred_time text check (occurred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	add column notes text check (char_length(notes) <= 1000);
-- No `on delete set null`: a Category in use can't be deleted, only archived.
alter table public.entries add constraint entries_category_id_household_id_fkey
	foreign key (category_id, household_id) references public.categories (id, household_id);
create index entries_category_id_idx on public.entries (category_id);

-- An Expense takes money out and an Income brings it in (amount is the signed change to the Balance); both have a
-- Category. A Balance adjustment has none.
alter table public.entries add constraint entries_kind_shape check (
	(kind = 'balance_adjustment' and category_id is null)
	or (kind = 'expense' and category_id is not null and amount < 0)
	or (kind = 'income' and category_id is not null and amount > 0)
);

-- An Expense's Category is from the Expense list, an Income's from the Income list, and an Entry is never newly put
-- in an archived Category (one already there keeps it). The Category is looked up in the Entry's own household only;
-- one elsewhere is left to the foreign key.
create function private.keep_entry_category_in_list() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	category public.categories;
begin
	if new.category_id is null then
		return new;
	end if;
	select * into category from public.categories
	where id = new.category_id and household_id = new.household_id;
	if not found then
		return new;
	end if;
	if category.kind is distinct from new.kind then
		raise exception 'An Entry''s Category is from its own list' using errcode = '23514';
	end if;
	if category.archived_at is not null then
		-- An update that keeps the Category is fine; OLD exists only on update, so it's read only there.
		if tg_op = 'UPDATE' then
			if new.category_id is not distinct from old.category_id then
				return new;
			end if;
		end if;
		raise exception 'An archived Category takes no new Entries' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_entry_category_in_list() from public;
create trigger keep_entry_category_in_list
	before insert or update of kind, category_id on public.entries
	for each row execute function private.keep_entry_category_in_list();

-- Admins and Members delete any Expense or Income (CONTEXT.md, Role). Balance adjustments join with #37.
create policy "Admins and Members delete Expenses and Incomes" on public.entries
	for delete to authenticated using (private.can_write(household_id) and kind in ('expense', 'income'));
grant delete on public.entries to authenticated;
