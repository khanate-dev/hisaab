-- Categories (spec §3.3): each household's own Expense and Income lists, copied from a built-in template, with one
-- level of Subcategories, an icon key and a colour key. Archived, not deleted, while in use. Expand-only.

create table public.categories (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	kind text not null check (kind in ('expense', 'income')),
	-- A Subcategory's parent, in the same household; a parent can't be deleted while it has Subcategories.
	parent_id uuid,
	name text not null check (char_length(btrim(name)) between 1 and 60),
	-- Stable keys into the app's curated registries (ADR-0008), never a Lucide name or a hex value.
	icon text not null check (icon ~ '^[a-z][a-z0-9_]{0,39}$'),
	color text not null check (color ~ '^[a-z][a-z0-9_]{0,39}$'),
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	-- Lets Subcategories (and, later, Entries) reference (category, household) together.
	unique (id, household_id),
	foreign key (parent_id, household_id) references public.categories (id, household_id),
	check (parent_id is distinct from id)
);
create index categories_household_id_idx on public.categories (household_id);
create index categories_parent_id_idx on public.categories (parent_id);
alter table public.categories enable row level security;
create policy "Members read their households' Categories" on public.categories
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members add Categories" on public.categories
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members edit Categories" on public.categories
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members delete unused Categories" on public.categories
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.categories from anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;

-- A Category stays in its household and list (ADR-0001); whole-row updates must leave its origin alone.
create function private.keep_category_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, kind and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_category_origin() from public;
create trigger keep_category_origin
	before update on public.categories
	for each row execute function private.keep_category_origin();

-- Subcategories are one level deep, in their parent's list, and never active under an archived parent (where they'd
-- show in neither list). The parent row is held, so it can't change under a Subcategory being added. The parent is
-- looked up in the row's own household only; one elsewhere is left to the foreign key, so nothing about another
-- household's Categories leaks through these errors.
create function private.keep_categories_one_level() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	parent public.categories;
begin
	if new.parent_id is null then
		return new;
	end if;
	select * into parent from public.categories
	where id = new.parent_id and household_id = new.household_id
	for share;
	if not found then
		return new;
	end if;
	if parent.parent_id is not null then
		raise exception 'Subcategories are one level deep' using errcode = '23514';
	end if;
	if parent.kind is distinct from new.kind then
		raise exception 'A Subcategory is in its parent''s list' using errcode = '23514';
	end if;
	if parent.archived_at is not null and new.archived_at is null then
		raise exception 'An archived Category''s Subcategories are archived too' using errcode = '23514';
	end if;
	if exists (select 1 from public.categories where parent_id = new.id) then
		raise exception 'A Category with Subcategories can''t become one' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_categories_one_level() from public;
create trigger keep_categories_one_level
	before insert or update of parent_id, archived_at on public.categories
	for each row execute function private.keep_categories_one_level();

-- Archiving a Category archives its active Subcategories with it, at the same moment, so bringing the parent back can
-- bring back exactly those. The app does the same locally; this covers Subcategories another device added meanwhile.
create function private.archive_subcategories() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	update public.categories set archived_at = new.archived_at
	where parent_id = new.id and archived_at is null;
	return null;
end;
$$;
revoke all on function private.archive_subcategories() from public;
create trigger archive_subcategories
	after update of archived_at on public.categories
	for each row when (old.archived_at is null and new.archived_at is not null and new.parent_id is null)
	execute function private.archive_subcategories();

-- The built-in template every household's Categories are copied from. Names are English at creation; households rename.
create table private.category_template (
	key text primary key,
	parent_key text references private.category_template (key),
	kind text not null check (kind in ('expense', 'income')),
	name text not null,
	icon text not null,
	color text not null
);
insert into private.category_template (key, parent_key, kind, name, icon, color) values
	('food', null, 'expense', 'Food', 'groceries', 'butter'),
	('groceries', 'food', 'expense', 'Groceries', 'groceries', 'butter'),
	('dining', 'food', 'expense', 'Dining out', 'dining', 'butter'),
	('snacks', 'food', 'expense', 'Coffee and snacks', 'coffee', 'butter'),
	('transport', null, 'expense', 'Transport', 'transport', 'cyan'),
	('fuel', 'transport', 'expense', 'Fuel', 'car', 'cyan'),
	('public_transport', 'transport', 'expense', 'Public transport', 'transport', 'cyan'),
	('ride_hailing', 'transport', 'expense', 'Ride-hailing', 'car', 'cyan'),
	('housing', null, 'expense', 'Housing', 'home', 'magenta'),
	('rent', 'housing', 'expense', 'Rent', 'home', 'magenta'),
	('utilities', 'housing', 'expense', 'Utilities', 'utilities', 'magenta'),
	('repairs', 'housing', 'expense', 'Repairs', 'repairs', 'magenta'),
	('phone', null, 'expense', 'Phone and internet', 'phone', 'violet'),
	('health', null, 'expense', 'Health', 'health', 'red'),
	('education', null, 'expense', 'Education', 'education', 'green'),
	('shopping', null, 'expense', 'Shopping', 'clothing', 'orange'),
	('clothing', 'shopping', 'expense', 'Clothing', 'clothing', 'orange'),
	('gifts_given', 'shopping', 'expense', 'Gifts', 'gifts', 'orange'),
	('children', null, 'expense', 'Children', 'children', 'lime'),
	('travel', null, 'expense', 'Travel', 'travel', 'cyan'),
	('salary', null, 'income', 'Salary', 'salary', 'green'),
	('business', null, 'income', 'Business', 'income', 'lime'),
	('gifts_received', null, 'income', 'Gifts received', 'gifts', 'butter'),
	('other_income', null, 'income', 'Other income', 'income', 'cyan');
revoke all on private.category_template from public, anon, authenticated;

-- Copies the template into a household: parents first, then their Subcategories under the new parents.
create function private.copy_category_template(target uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	ids jsonb := '{}';
	item private.category_template;
	new_id uuid;
begin
	for item in select * from private.category_template order by parent_key nulls first, key loop
		new_id := private.uuid_v7();
		ids := ids || jsonb_build_object(item.key, new_id);
		insert into public.categories (id, household_id, kind, parent_id, name, icon, color)
		values (new_id, target, item.kind, (ids ->> item.parent_key)::uuid, item.name, item.icon, item.color);
	end loop;
end;
$$;
revoke all on function private.copy_category_template(uuid) from public;

create function private.give_household_categories() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform private.copy_category_template(new.id);
	return new;
end;
$$;
revoke all on function private.give_household_categories() from public;
create trigger give_household_categories
	after insert on public.households
	for each row execute function private.give_household_categories();

-- Households that predate Categories get them too.
select private.copy_category_template(id) from public.households;
