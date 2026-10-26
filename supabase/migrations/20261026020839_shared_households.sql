-- Shared households and household settings (spec §3.1, §3.2): any User creates a shared household and is its first
-- Admin; Admins set its Base currency (still fixed once it has an Entry), Budget month start day and timezone; each
-- Member picks a default Wallet per household. Expand-only: new nullable or defaulted columns, new policies.

-- Who created a shared household; the User a new household's first Membership must be. Null on Personal households
-- and on households created before this column.
alter table public.households add column created_by uuid;
-- The day each Budget month starts on: the 1st by default, at most the 28th so every month has it.
alter table public.households add column budget_month_start_day smallint not null default 1
	check (budget_month_start_day between 1 and 28);

-- Whether anyone belongs to the household yet. Security definer, so it sees Memberships the User can't.
create function private.has_members(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (select 1 from public.memberships where household_id = target_household_id);
$$;
revoke all on function private.has_members(uuid) from public;
grant execute on function private.has_members(uuid) to authenticated;

-- Whether the signed-in User is founding this household: they created it, it's shared, and nobody belongs to it yet.
-- Security definer, so the check sees the household before the User can.
create function private.is_founding(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.households
		where id = target_household_id and personal_user_id is null and created_by = (select auth.uid())
	) and not private.has_members(target_household_id);
$$;
revoke all on function private.is_founding(uuid) from public;
grant execute on function private.is_founding(uuid) to authenticated;

grant insert on public.households to authenticated;
create policy "Users create shared households" on public.households
	for insert to authenticated
	with check (personal_user_id is null and created_by = (select auth.uid()));
-- The upsert reads the new row back before its first Membership exists. On the row itself, not through
-- is_founding: a function's snapshot doesn't yet see the row its own statement inserted.
create policy "Founders read the household they're founding" on public.households
	for select to authenticated
	using (personal_user_id is null and created_by = (select auth.uid()) and not private.has_members(id));

-- The founder's own Admin Membership, the household's first. Later Memberships come through Invites (#41).
grant insert, update on public.memberships to authenticated;
create policy "Founders become their household's first Admin" on public.memberships
	for insert to authenticated
	with check (user_id = (select auth.uid()) and role = 'admin' and private.is_founding(household_id));

-- The upsert reads the new Membership back too, before is_member's snapshot can see it.
create policy "Users read their own Memberships" on public.memberships
	for select to authenticated using (user_id = (select auth.uid()));

-- created_by is the founder's for good, like the other server-set columns.
create or replace function private.keep_household_server_columns() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id
		or new.personal_user_id is distinct from old.personal_user_id
		or new.created_by is distinct from old.created_by
		or new.created_at is distinct from old.created_at then
		raise exception 'id, personal_user_id, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- Each Member's default Wallet in the household, for new Entries. A Wallet that goes takes the default with it.
alter table public.memberships add column default_wallet_id uuid;
alter table public.memberships add constraint memberships_default_wallet_id_household_id_fkey
	foreign key (default_wallet_id, household_id) references public.wallets (id, household_id)
	on delete set null (default_wallet_id);
create index memberships_default_wallet_id_idx on public.memberships (default_wallet_id);

create policy "Members pick their own default Wallet" on public.memberships
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

-- A Membership stays whose and where it is, and its Role changes only with Members and Roles (#42).
create function private.keep_membership_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.user_id is distinct from old.user_id or new.role is distinct from old.role
		or new.created_at is distinct from old.created_at then
		raise exception 'Only a Membership''s default Wallet changes here' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_membership_origin() from public;
create trigger keep_membership_origin before update on public.memberships
	for each row execute function private.keep_membership_origin();
