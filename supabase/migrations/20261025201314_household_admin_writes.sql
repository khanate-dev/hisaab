-- Admins rename their households and delete shared ones (spec §3.1). The Personal household is never deleted here;
-- it goes with the account (#64).

create function private.is_admin(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.memberships
		where household_id = target_household_id and user_id = (select auth.uid()) and role = 'admin'
	);
$$;
revoke all on function private.is_admin(uuid) from public;
grant execute on function private.is_admin(uuid) to authenticated;

-- The upload connector sends whole rows (ADR-0007), so the grant covers every column and a trigger keeps the
-- server-set ones from changing.
grant update, delete on public.households to authenticated;

create function private.keep_household_server_columns() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.personal_user_id is distinct from old.personal_user_id or new.created_at is distinct from old.created_at then
		raise exception 'personal_user_id and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_household_server_columns() from public;

create trigger keep_household_server_columns
	before update on public.households
	for each row execute function private.keep_household_server_columns();

create policy "Admins rename their households" on public.households
	for update to authenticated
	using (private.is_admin(id))
	with check (private.is_admin(id));

create policy "Admins delete their shared households" on public.households
	for delete to authenticated
	using (personal_user_id is null and private.is_admin(id));
