-- Recurring rules and Occurrences (spec §3.3, ADR-0004): a template Expense or Income plus a schedule (monthly on day
-- N, every N months, weekly, every N weeks or yearly, with an optional end). Confirm, the default, leaves each due
-- Occurrence Pending until a Member confirms, skips or snoozes it; Auto-record makes it an Entry on its due date.
-- Pending Occurrences are derived on the device from the schedule; only what's been done with one is stored. An
-- Occurrence's id, and its Entry's, come from the rule and the due date, so two devices doing the same one merge.
-- Expand-only: new tables, and keep_entry_origin widened.

create table public.recurring_rules (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	mode text not null default 'confirm' check (mode in ('confirm', 'auto')),
	kind text not null check (kind in ('expense', 'income')),
	wallet_id uuid not null,
	-- No `on delete set null`: a Category a rule uses is in use, so it's archived, never deleted.
	category_id uuid not null,
	-- Positive; null for a variable bill, whose amount is asked for when it's confirmed.
	amount numeric check (amount > 0),
	description text check (char_length(description) <= 200),
	-- Monthly every `interval` months on `day_of_month`; weekly every `interval` weeks on `starts_on`'s weekday;
	-- yearly on `starts_on`'s day.
	frequency text not null check (frequency in ('monthly', 'weekly', 'yearly')),
	interval integer not null default 1 check (interval between 1 and 24),
	-- 1 to 31; a month shorter than that has it on its last day.
	day_of_month integer check (day_of_month between 1 and 31),
	starts_on date not null,
	ends_on date check (ends_on >= starts_on),
	created_by uuid not null references auth.users (id),
	created_at timestamptz not null default now(),
	unique (id, household_id),
	check ((frequency = 'monthly') = (day_of_month is not null)),
	-- Auto-record needs to know how much.
	check (mode = 'confirm' or amount is not null),
	-- A Wallet deleted takes its rules with it, as it does its Entries.
	foreign key (wallet_id, household_id) references public.wallets (id, household_id) on delete cascade,
	foreign key (category_id, household_id) references public.categories (id, household_id)
);
create index recurring_rules_household_id_idx on public.recurring_rules (household_id);
create index recurring_rules_wallet_id_idx on public.recurring_rules (wallet_id);
create index recurring_rules_category_id_idx on public.recurring_rules (category_id);
alter table public.recurring_rules enable row level security;
create policy "Members read their households' Recurring rules" on public.recurring_rules
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members make Recurring rules as themselves" on public.recurring_rules
	for insert to authenticated with check (private.can_write(household_id) and created_by = (select auth.uid()));
create policy "Admins and Members edit Recurring rules" on public.recurring_rules
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members delete Recurring rules" on public.recurring_rules
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.recurring_rules from anon, authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;

-- A rule stays in its household and stays an Expense or an Income; its maker stays who made it.
create function private.keep_recurring_rule_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.kind is distinct from old.kind or new.created_by is distinct from old.created_by
		or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, kind, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_recurring_rule_origin() from public;
create trigger keep_recurring_rule_origin before update on public.recurring_rules
	for each row execute function private.keep_recurring_rule_origin();

-- A rule's Category is from its own list, and an archived one takes no new rule (one already there keeps it).
create function private.keep_recurring_rule_category_in_list() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	category public.categories;
begin
	select * into category from public.categories
	where id = new.category_id and household_id = new.household_id;
	if not found then
		return new;
	end if;
	if category.kind is distinct from new.kind then
		raise exception 'A Recurring rule''s Category is from its own list' using errcode = '23514';
	end if;
	if category.archived_at is not null then
		if tg_op = 'UPDATE' then
			if new.category_id is not distinct from old.category_id then
				return new;
			end if;
		end if;
		raise exception 'An archived Category takes no new Recurring rule' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_recurring_rule_category_in_list() from public;
create trigger keep_recurring_rule_category_in_list
	before insert or update of kind, category_id on public.recurring_rules
	for each row execute function private.keep_recurring_rule_category_in_list();

-- What's been done with an Occurrence, for the whole household: confirmed (or Auto-recorded) into its Entry, skipped,
-- or snoozed until a date. An Occurrence with no row here is Pending once it's due. The id comes from the rule and the
-- due date (`occurrenceId`), so two devices doing the same Occurrence write the same row.
create table public.occurrences (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	rule_id uuid not null,
	due_on date not null,
	state text not null check (state in ('confirmed', 'skipped', 'snoozed')),
	snoozed_until date,
	-- The Entry it became (`occurrenceEntryId`); kept as an id, as the Entry may later be deleted on its own.
	entry_id uuid,
	created_at timestamptz not null default now(),
	unique (rule_id, due_on),
	check ((state = 'snoozed') = (snoozed_until is not null)),
	check ((state = 'confirmed') = (entry_id is not null)),
	-- A rule deleted takes what was done with its Occurrences with it; the Entries they became stay.
	foreign key (rule_id, household_id) references public.recurring_rules (id, household_id) on delete cascade
);
create index occurrences_household_id_idx on public.occurrences (household_id);
create index occurrences_entry_id_idx on public.occurrences (entry_id);
alter table public.occurrences enable row level security;
create policy "Members read their households' Occurrences" on public.occurrences
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members confirm, skip and snooze Occurrences" on public.occurrences
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members change Occurrences" on public.occurrences
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members undo Occurrences" on public.occurrences
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.occurrences from anon, authenticated;
grant select, insert, update, delete on public.occurrences to authenticated;

-- An Occurrence stays the rule's and its due date's. Another device writing the same one (an upsert of the same id)
-- quietly keeps when it was first done. Once confirmed it stays confirmed while its Entry exists: a skip or snooze from
-- a device that hadn't seen the confirm yet quietly keeps it, so nothing says Pending, or skipped, about money already
-- recorded.
create function private.keep_occurrence_origin() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.rule_id is distinct from old.rule_id or new.due_on is distinct from old.due_on then
		raise exception 'An Occurrence stays its rule''s, on its due date' using errcode = '42501';
	end if;
	new.created_at := old.created_at;
	if old.state = 'confirmed' and new.state <> 'confirmed'
		and exists (select 1 from public.entries where id = old.entry_id) then
		return old;
	end if;
	return new;
end;
$$;
revoke all on function private.keep_occurrence_origin() from public;
create trigger keep_occurrence_origin before update on public.occurrences
	for each row execute function private.keep_occurrence_origin();

-- An Occurrence's ids are the ones every device derives from its rule and due date (`occurrenceId`,
-- `occurrenceEntryId` in the domain package; the same name-based UUIDs as uuid_generate_v5), so its row can't be made
-- to point at some other Entry.
create function private.keep_occurrence_ids_derived() returns trigger
language plpgsql
set search_path = ''
as $$
declare
	namespace constant uuid := '6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f';
begin
	if new.id is distinct from extensions.uuid_generate_v5(namespace, format('occurrence/%s/%s', new.rule_id, new.due_on))
		or (new.entry_id is not null and new.entry_id is distinct from
			extensions.uuid_generate_v5(namespace, format('entry/%s/%s', new.rule_id, new.due_on))) then
		raise exception 'An Occurrence''s ids come from its rule and due date' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_occurrence_ids_derived() from public;
create trigger keep_occurrence_ids_derived before insert or update on public.occurrences
	for each row execute function private.keep_occurrence_ids_derived();

-- Two devices confirming (or Auto-recording) the same Occurrence write the same Entry id: the second upload lands as an
-- update of the first, whoever sent it, so the copies merge instead of being refused. Who recorded it stays whoever
-- did first. Anything else keeps its origin as before.
create or replace function private.keep_entry_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if (new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at)
		and new.id is not distinct from old.id and new.household_id is not distinct from old.household_id
		and exists (select 1 from public.occurrences where entry_id = old.id and household_id = old.household_id) then
		new.created_by := old.created_by;
		new.created_at := old.created_at;
	end if;
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;

create trigger log_activity after insert or update or delete on public.recurring_rules
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.occurrences
	for each row execute function private.log_activity();
