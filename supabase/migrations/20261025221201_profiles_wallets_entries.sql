-- Profiles, the Base currency, Wallets and Entries: the First Wallet tracer bullet (#31). Expand-only.

-- Whether the signed-in User may change this household's data: Admins and Members, never Viewers.
create function private.can_write(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.memberships
		where household_id = target_household_id and user_id = (select auth.uid()) and role in ('admin', 'member')
	);
$$;
revoke all on function private.can_write(uuid) from public;
grant execute on function private.can_write(uuid) to authenticated;

-- Whether the signed-in User shares a household with this User (so they may see each other's name).
create function private.shares_household(other_user_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.memberships mine
		join public.memberships theirs on theirs.household_id = mine.household_id
		where mine.user_id = (select auth.uid()) and theirs.user_id = other_user_id
	);
$$;
revoke all on function private.shares_household(uuid) from public;
grant execute on function private.shares_household(uuid) to authenticated;

-- A User's name, shown to the people they share a household with. Identity, not financial data, so no household_id.
-- TODO(#64): account deletion removes the profile and leaves a Former member in shared households.
create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
	created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users and their fellow Members read profiles" on public.profiles
	for select to authenticated using (id = (select auth.uid()) or private.shares_household(id));
create policy "Users create their own profile" on public.profiles
	for insert to authenticated with check (id = (select auth.uid()));
create policy "Users edit their own profile" on public.profiles
	for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- The Base currency (ADR-0005): the default for new Wallets and the currency of Budgets and reports.
alter table public.households add column base_currency text check (base_currency ~ '^[A-Z]{3}$');

create table public.wallets (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	name text not null check (char_length(btrim(name)) between 1 and 60),
	type text not null check (type in ('cash', 'bank', 'mobile_wallet', 'credit_card')),
	currency text not null check (currency ~ '^[A-Z]{3}$'),
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	-- Lets Entries reference (wallet, household) together, so an Entry can't point at another household's Wallet.
	unique (id, household_id)
);
create index wallets_household_id_idx on public.wallets (household_id);
alter table public.wallets enable row level security;
create policy "Members read their households' Wallets" on public.wallets
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members add Wallets" on public.wallets
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members edit Wallets" on public.wallets
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
revoke all on public.wallets from anon, authenticated;
grant select, insert, update on public.wallets to authenticated;

-- A Wallet stays in the household it was created in (ADR-0001); whole-row updates must leave its origin alone.
create function private.keep_wallet_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_wallet_origin() from public;

create trigger keep_wallet_origin
	before update on public.wallets
	for each row execute function private.keep_wallet_origin();

-- An Entry changes one Wallet's Balance by `amount` (signed: its effect on the Balance). Balances are derived from
-- Entries and never stored (ADR-0002). Kinds widen as features land: Expense, Income, Transfer and Loans next.
create table public.entries (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	wallet_id uuid not null,
	kind text not null check (kind in ('balance_adjustment')),
	amount numeric not null,
	occurred_on date not null,
	description text check (char_length(description) <= 200),
	-- TODO(#64): account deletion re-points this at the household's Former member.
	created_by uuid not null references auth.users (id),
	created_at timestamptz not null default now(),
	foreign key (wallet_id, household_id) references public.wallets (id, household_id) on delete cascade
);
create index entries_household_id_idx on public.entries (household_id);
create index entries_wallet_id_idx on public.entries (wallet_id);
alter table public.entries enable row level security;
create policy "Members read their households' Entries" on public.entries
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members record Entries as themselves" on public.entries
	for insert to authenticated with check (private.can_write(household_id) and created_by = (select auth.uid()));
-- Members record and edit any Entry (CONTEXT.md: Member). Uploads send a PUT as an upsert, which needs UPDATE too.
create policy "Admins and Members edit Entries" on public.entries
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
revoke all on public.entries from anon, authenticated;
grant select, insert, update on public.entries to authenticated;

-- The author and the household are facts about how the Entry came to be; whole-row updates must leave them alone.
create function private.keep_entry_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_entry_origin() from public;

create trigger keep_entry_origin
	before update on public.entries
	for each row execute function private.keep_entry_origin();

-- ADR-0005: the Base currency is fixed once the household has any Entry.
-- Security definer, so the check sees every Entry regardless of the caller's RLS.
create function private.lock_base_currency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.base_currency is distinct from old.base_currency
		and exists (select 1 from public.entries where household_id = new.id) then
		raise exception 'The Base currency is fixed once the household has an Entry' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.lock_base_currency() from public;

create trigger lock_base_currency
	before update of base_currency on public.households
	for each row execute function private.lock_base_currency();

-- Recording an Entry holds a share lock on its household row until commit. A concurrent Base currency change waits
-- for it, then its check sees the committed Entry; without this both could commit under READ COMMITTED.
create function private.hold_household_for_entry() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform 1 from public.households where id = new.household_id for share;
	return new;
end;
$$;
revoke all on function private.hold_household_for_entry() from public;

create trigger hold_household_for_entry
	before insert on public.entries
	for each row execute function private.hold_household_for_entry();

-- The household update policy now also covers the Base currency, not just the name.
alter policy "Admins rename their households" on public.households rename to "Admins edit their households";
