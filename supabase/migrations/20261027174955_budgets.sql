-- Budgets and Expected income (spec §3.3): a standing amount per Budget month for a Category, valid from a Budget month
-- onward until changed, and Budget overrides replacing it for one month; no rollover. Expected income is the same thing
-- for an income Category. Amounts are in the household's Base currency. Expand-only: new tables.

create table public.budgets (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	category_id uuid not null,
	-- The Budget month (YYYY-MM it starts in) it's valid from.
	valid_from text not null check (valid_from ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	-- Null: no Budget from this month on, until a later one.
	amount numeric check (amount >= 0),
	created_at timestamptz not null default now(),
	-- Not unique per Category and month: two devices offline may each set the same one, and both rows sync rather
	-- than one being rejected. The one written last wins (`budgetFor`).
	-- A Category deleted (only ever unused) takes its Budgets with it.
	foreign key (category_id, household_id) references public.categories (id, household_id) on delete cascade
);
create index budgets_household_id_idx on public.budgets (household_id);
create index budgets_category_id_idx on public.budgets (category_id);
alter table public.budgets enable row level security;
create policy "Members read their households' Budgets" on public.budgets
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members set Budgets" on public.budgets
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members change Budgets" on public.budgets
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members remove Budgets" on public.budgets
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.budgets from anon, authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

create table public.budget_overrides (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	category_id uuid not null,
	-- The one Budget month it replaces the standing amount in.
	month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	amount numeric not null check (amount >= 0),
	created_at timestamptz not null default now(),
	-- Not unique either, for the same reason as Budgets.
	foreign key (category_id, household_id) references public.categories (id, household_id) on delete cascade
);
create index budget_overrides_household_id_idx on public.budget_overrides (household_id);
create index budget_overrides_category_id_idx on public.budget_overrides (category_id);
alter table public.budget_overrides enable row level security;
create policy "Members read their households' Budget overrides" on public.budget_overrides
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members set Budget overrides" on public.budget_overrides
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members change Budget overrides" on public.budget_overrides
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members remove Budget overrides" on public.budget_overrides
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.budget_overrides from anon, authenticated;
grant select, insert, update, delete on public.budget_overrides to authenticated;

-- A Budget stays for its Category and month; changing one changes its amount. Whole-row updates leave the rest alone.
create function private.keep_budget_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.category_id is distinct from old.category_id or new.created_at is distinct from old.created_at
		or to_jsonb(new) ->> (case when tg_table_name = 'budgets' then 'valid_from' else 'month' end)
			is distinct from to_jsonb(old) ->> (case when tg_table_name = 'budgets' then 'valid_from' else 'month' end) then
		raise exception 'A Budget stays for its Category and month' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_budget_origin() from public;
create trigger keep_budget_origin before update on public.budgets
	for each row execute function private.keep_budget_origin();
create trigger keep_budget_origin before update on public.budget_overrides
	for each row execute function private.keep_budget_origin();

create trigger log_activity after insert or update or delete on public.budgets
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.budget_overrides
	for each row execute function private.log_activity();
