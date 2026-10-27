-- Saved filters (spec §3.4, CONTEXT.md): a named set of search and filter criteria over a household's Entries,
-- private to the User who saved it. Search itself runs on the device; only the criteria are stored. Expand-only: a new
-- table.

create table public.saved_filters (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- Whose it is; nobody else in the household sees it. Goes with the account (ADR-0001).
	user_id uuid not null references auth.users (id) on delete cascade,
	name text not null check (char_length(btrim(name)) between 1 and 60),
	-- The criteria as the app writes them (`writeSavedCriteria`), read back leniently (`readSavedCriteria`): JSON
	-- text, as it syncs and uploads, holding an object.
	criteria text not null check (jsonb_typeof(criteria::jsonb) = 'object'),
	created_at timestamptz not null default now()
);
create index saved_filters_household_id_idx on public.saved_filters (household_id);
create index saved_filters_user_id_idx on public.saved_filters (user_id);
alter table public.saved_filters enable row level security;
-- Every Role searches, Viewers included, so anyone in the household keeps their own.
create policy "Users read their own Saved filters" on public.saved_filters
	for select to authenticated using (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users save their own filters" on public.saved_filters
	for insert to authenticated with check (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users change their own Saved filters" on public.saved_filters
	for update to authenticated
	using (user_id = (select auth.uid()) and private.is_member(household_id))
	with check (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users delete their own Saved filters" on public.saved_filters
	for delete to authenticated using (user_id = (select auth.uid()) and private.is_member(household_id));
revoke all on public.saved_filters from anon, authenticated;
grant select, insert, update, delete on public.saved_filters to authenticated;

-- A Saved filter stays its User's, in its household.
create function private.keep_saved_filter_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, user_id and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_saved_filter_origin() from public;
create trigger keep_saved_filter_origin before update on public.saved_filters
	for each row execute function private.keep_saved_filter_origin();
