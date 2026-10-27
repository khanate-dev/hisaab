-- Members and Roles (spec §3.1): Admins change Members' Roles and remove them; anyone leaves a shared household,
-- except its last Admin; an Admin deletes a shared household with everything in it (the households delete policy and
-- the cascades already do that). Expand-only: new policies, a widened trigger, a new guard.

-- Whether a household is a shared one; a Personal household has its one Member for good (#64 takes it with the
-- account).
create function private.is_shared(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (select 1 from public.households where id = target_household_id and personal_user_id is null);
$$;
revoke all on function private.is_shared(uuid) from public;
grant execute on function private.is_shared(uuid) to authenticated;

create policy "Admins change Members' Roles" on public.memberships
	for update to authenticated
	using (private.is_admin(household_id) and private.is_shared(household_id))
	with check (private.is_admin(household_id) and private.is_shared(household_id));

grant delete on public.memberships to authenticated;
create policy "Admins remove Members" on public.memberships
	for delete to authenticated using (private.is_admin(household_id) and private.is_shared(household_id));
create policy "Members leave shared households" on public.memberships
	for delete to authenticated using (user_id = (select auth.uid()) and private.is_shared(household_id));

-- A Membership stays whose and where it is; its Role changes only by an Admin, and only its own User picks its default
-- Wallet. Clearing one is anyone's (a Wallet going clears it through its foreign key, whoever deletes it), and the
-- server itself (no signed-in User) is exempt.
create or replace function private.keep_membership_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
		raise exception 'A Membership stays whose and where it is' using errcode = '42501';
	end if;
	if new.role is distinct from old.role and (select auth.uid()) is not null
		and not (private.is_admin(new.household_id) and private.is_shared(new.household_id)) then
		raise exception 'Only an Admin changes a Role' using errcode = '42501';
	end if;
	if new.default_wallet_id is distinct from old.default_wallet_id and new.default_wallet_id is not null
		and (select auth.uid()) is not null and (select auth.uid()) <> new.user_id then
		raise exception 'Only its own User picks a default Wallet' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- A shared household keeps an Admin: its last one can't leave, be removed or step down. Exempt: a household being
-- deleted (its row is already gone, so the lock below finds nothing) and a User being deleted (#64 replaces them with a
-- Former member). Named to run after keep_membership_origin, so a refused Role change says why first.
create function private.keep_one_admin() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	losing_an_admin boolean := old.role = 'admin';
begin
	-- NEW exists only on update, so it's read only there.
	if tg_op = 'UPDATE' then
		if new.role = 'admin' then
			losing_an_admin := false;
		end if;
	end if;
	if losing_an_admin and private.is_shared(old.household_id)
		and exists (select 1 from auth.users where id = old.user_id) then
		-- Held until commit, so two Admins stepping down at once can't both pass the count below.
		perform 1 from public.households where id = old.household_id for update;
		if found and not exists (
			select 1 from public.memberships
			where household_id = old.household_id and role = 'admin' and id <> old.id
		) then
			raise exception 'A household keeps one Admin at least' using errcode = '23514';
		end if;
	end if;
	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;
revoke all on function private.keep_one_admin() from public;
create trigger keep_one_admin before update of role or delete on public.memberships
	for each row execute function private.keep_one_admin();
