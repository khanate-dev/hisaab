-- CSV import (spec §3.4, issue #10 resolution 11): an Admin's column mapping is kept per Wallet, so the next statement
-- from the same bank maps itself. Imported rows become ordinary Entries (attributed to the importer, in the Activity
-- log), so only the mapping is new here. Admin-only, like the other data tools. Expand-only: a new table.

create table public.import_mappings (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	wallet_id uuid not null,
	-- The mapping as the app writes it (`ImportMapping`), read back leniently (`readMapping`): JSON text holding an
	-- object, as it syncs and uploads.
	mapping text not null check (jsonb_typeof(mapping::jsonb) = 'object'),
	created_at timestamptz not null default now(),
	-- A Wallet deleted takes its mapping with it.
	foreign key (wallet_id, household_id) references public.wallets (id, household_id) on delete cascade
);
-- One per Wallet: a second device's first mapping for the same Wallet is a conflict the app resolves by updating.
create unique index import_mappings_one_per_wallet on public.import_mappings (wallet_id);
create index import_mappings_household_id_idx on public.import_mappings (household_id);
alter table public.import_mappings enable row level security;
create policy "Admins read their households' import mappings" on public.import_mappings
	for select to authenticated using (private.is_admin(household_id));
create policy "Admins save import mappings" on public.import_mappings
	for insert to authenticated with check (private.is_admin(household_id));
create policy "Admins change import mappings" on public.import_mappings
	for update to authenticated using (private.is_admin(household_id)) with check (private.is_admin(household_id));
create policy "Admins remove import mappings" on public.import_mappings
	for delete to authenticated using (private.is_admin(household_id));
revoke all on public.import_mappings from anon, authenticated;
grant select, insert, update, delete on public.import_mappings to authenticated;

-- A mapping stays its Wallet's.
create function private.keep_import_mapping_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.wallet_id is distinct from old.wallet_id or new.created_at is distinct from old.created_at then
		raise exception 'An import mapping stays its Wallet''s' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_import_mapping_origin() from public;
create trigger keep_import_mapping_origin before update on public.import_mappings
	for each row execute function private.keep_import_mapping_origin();
