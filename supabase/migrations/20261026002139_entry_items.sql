-- Items (spec §3.3, §4.3): an Expense broken into lines, each with a description, an amount, an optional
-- informational quantity and its own Category, which budgets and reports count it in. Expand-only.
--
-- "Once an Expense has Items, its total is their sum" holds here too: an Expense with Items takes its amount from
-- them, whichever of its rows arrives last, so concurrent edits and a rejected Item can't leave it out of step.

-- Lets Items reference (entry, household) together, so an Item can't hang off another household's Entry.
alter table public.entries add constraint entries_id_household_id_key unique (id, household_id);

create table public.entry_items (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	entry_id uuid not null,
	-- The order Items were added in; they're never reordered.
	position integer not null check (position >= 0),
	description text not null check (char_length(btrim(description)) between 1 and 200),
	-- How much, as a positive amount in the Expense's Wallet's currency; the Expense's amount is minus their sum.
	amount numeric not null check (amount > 0),
	-- Informational only ("2 kg", "3"); never multiplied into the amount.
	quantity text check (char_length(btrim(quantity)) between 1 and 40),
	category_id uuid not null,
	-- The Rest (CONTEXT.md): the remainder the Items split out of the receipt total left, saved as "Other <category>".
	rest boolean not null default false,
	created_at timestamptz not null default now(),
	foreign key (entry_id, household_id) references public.entries (id, household_id) on delete cascade,
	-- No `on delete set null`: a Category an Item is in is in use, so it's archived, never deleted.
	foreign key (category_id, household_id) references public.categories (id, household_id)
);
create index entry_items_household_id_idx on public.entry_items (household_id);
create index entry_items_entry_id_idx on public.entry_items (entry_id);
create index entry_items_category_id_idx on public.entry_items (category_id);
alter table public.entry_items enable row level security;
create policy "Members read their households' Items" on public.entry_items
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members add Items" on public.entry_items
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members edit Items" on public.entry_items
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members remove Items" on public.entry_items
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.entry_items from anon, authenticated;
grant select, insert, update, delete on public.entry_items to authenticated;

-- An Item stays on its Entry in its household (ADR-0001); whole-row updates must leave its origin alone.
create function private.keep_item_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.entry_id is distinct from old.entry_id or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, entry_id and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_item_origin() from public;
create trigger keep_item_origin
	before update on public.entry_items
	for each row execute function private.keep_item_origin();

-- Only an Expense has Items, each in a Category from the Expense list, never newly put in an archived one. Both are
-- looked up in the Item's own household only; anything elsewhere is left to the foreign keys.
create function private.keep_item_in_expense() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	entry_kind text;
	category public.categories;
begin
	select kind into entry_kind from public.entries where id = new.entry_id and household_id = new.household_id;
	if found and entry_kind is distinct from 'expense' then
		raise exception 'Only an Expense has Items' using errcode = '23514';
	end if;
	select * into category from public.categories where id = new.category_id and household_id = new.household_id;
	if not found then
		return new;
	end if;
	if category.kind is distinct from 'expense' then
		raise exception 'An Item''s Category is from the Expense list' using errcode = '23514';
	end if;
	if category.archived_at is not null then
		-- An update that keeps the Category is fine; OLD exists only on update, so it's read only there.
		if tg_op = 'UPDATE' then
			if new.category_id is not distinct from old.category_id then
				return new;
			end if;
		end if;
		raise exception 'An archived Category takes no new Items' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_item_in_expense() from public;
create trigger keep_item_in_expense
	before insert or update of entry_id, category_id on public.entry_items
	for each row execute function private.keep_item_in_expense();

-- An Expense with Items takes its amount from them: minus their sum, kept whenever an Item changes and whenever the
-- Expense itself is written, and it stays an Expense.
create function private.amount_from_items() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	items_total numeric;
begin
	select sum(amount) into items_total from public.entry_items
	where entry_id = new.id and household_id = new.household_id;
	if items_total is null then
		return new;
	end if;
	if new.kind is distinct from 'expense' then
		raise exception 'Only an Expense has Items' using errcode = '23514';
	end if;
	new.amount := -items_total;
	return new;
end;
$$;
revoke all on function private.amount_from_items() from public;
create trigger amount_from_items
	before insert or update on public.entries
	for each row execute function private.amount_from_items();

create function private.expense_follows_items() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	changed public.entry_items := coalesce(new, old);
	items_total numeric;
begin
	select sum(amount) into items_total from public.entry_items
	where entry_id = changed.entry_id and household_id = changed.household_id;
	-- Its last Item removed, an Expense keeps the amount they last added up to.
	if items_total is not null then
		update public.entries set amount = -items_total
		where id = changed.entry_id and household_id = changed.household_id and amount is distinct from -items_total;
	end if;
	return null;
end;
$$;
revoke all on function private.expense_follows_items() from public;
create trigger expense_follows_items
	after insert or update or delete on public.entry_items
	for each row execute function private.expense_follows_items();
