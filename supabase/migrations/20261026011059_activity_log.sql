-- The Activity log (spec §3.2): every change to a household's data, append-only: who made it, when on their device,
-- when it reached the server, and the row before and after. Every Member reads it, nobody edits it, and a deleted
-- Entry can be restored from it. Expand-only.

create table public.activity_log (
	id uuid primary key default private.uuid_v7(),
	-- Deleting a household hard-deletes everything, its Activity log included (spec §3.1).
	household_id uuid not null references public.households (id) on delete cascade,
	table_name text not null,
	row_id uuid not null,
	action text not null check (action in ('insert', 'update', 'delete')),
	-- The User who made the change; null when the server made it (say, a household's template Categories).
	actor_id uuid,
	-- When the change was made on its device, as the device said; null when it didn't say.
	device_time timestamptz,
	-- When it reached the server.
	synced_at timestamptz not null default now(),
	-- Changes made together (an Entry deleted with its Items) share it, so they can be restored together.
	transaction_id bigint not null default txid_current(),
	before jsonb,
	after jsonb
);
create index activity_log_household_synced_idx on public.activity_log (household_id, synced_at desc);
create index activity_log_row_idx on public.activity_log (row_id);
alter table public.activity_log enable row level security;
create policy "Members read their households' Activity log" on public.activity_log
	for select to authenticated using (private.is_member(household_id));
-- Append-only: the log triggers write it; no role inserts, edits or deletes a row.
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- A row as the log keeps it: money as exact decimal text, never a JSON number a reader would round.
create function private.as_logged(row_data jsonb) returns jsonb
language sql immutable
set search_path = ''
as $$
	select row_data
		|| case when row_data ? 'amount' and row_data -> 'amount' <> 'null'
			then jsonb_build_object('amount', row_data ->> 'amount') else '{}' end
		|| case when row_data ? 'to_amount' and row_data -> 'to_amount' <> 'null'
			then jsonb_build_object('to_amount', row_data ->> 'to_amount') else '{}' end
$$;

create function private.log_activity() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	changed jsonb := to_jsonb(coalesce(new, old));
	household uuid := case when tg_table_name = 'households' then (changed ->> 'id')::uuid
		else (changed ->> 'household_id')::uuid end;
	device_time timestamptz;
begin
	-- A household being deleted takes its log with it; nothing to record about its rows going.
	if not exists (select 1 from public.households where id = household) then
		return null;
	end if;
	-- A whole-row update that changed nothing isn't a change.
	if tg_op = 'UPDATE' then
		if to_jsonb(new) = to_jsonb(old) then
			return null;
		end if;
	end if;
	begin
		device_time := (current_setting('request.headers', true)::jsonb ->> 'x-device-time')::timestamptz;
	exception when others then
		device_time := null;
	end;
	insert into public.activity_log (household_id, table_name, row_id, action, actor_id, device_time, before, after)
	values (
		household,
		tg_table_name,
		(changed ->> 'id')::uuid,
		lower(tg_op),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid,
		device_time,
		case when tg_op = 'INSERT' then null else private.as_logged(to_jsonb(old)) end,
		case when tg_op = 'DELETE' then null else private.as_logged(to_jsonb(new)) end
	);
	return null;
end;
$$;
revoke all on function private.log_activity() from public;

create trigger log_activity after insert or update or delete on public.households
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.memberships
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.wallets
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.categories
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.entries
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.entry_items
	for each row execute function private.log_activity();

-- Restoring puts an Entry back as it was, even into a Category archived since it was deleted.
create function private.restoring() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(current_setting('hisaab.restoring', true), '') = 'on' $$;

create or replace function private.keep_entry_category_in_list() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	category public.categories;
begin
	if new.category_id is null then
		return new;
	end if;
	select * into category from public.categories
	where id = new.category_id and household_id = new.household_id;
	if not found then
		return new;
	end if;
	if category.kind is distinct from new.kind then
		raise exception 'An Entry''s Category is from its own list' using errcode = '23514';
	end if;
	if category.archived_at is not null and not private.restoring() then
		-- An update that keeps the Category is fine; OLD exists only on update, so it's read only there.
		if tg_op = 'UPDATE' then
			if new.category_id is not distinct from old.category_id then
				return new;
			end if;
		end if;
		raise exception 'An archived Category takes no new Entries' using errcode = '23514';
	end if;
	return new;
end;
$$;

create or replace function private.keep_item_in_expense() returns trigger
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
	if category.archived_at is not null and not private.restoring() then
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

-- Puts a deleted Entry back as it was when deleted, with the Items deleted along with it. Admins and Members only,
-- and only while the Entry is gone. The restore is itself logged, as an insert by whoever restored it.
create function public.restore_entry(entry_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	deletion public.activity_log;
	item public.activity_log;
begin
	select * into deletion from public.activity_log
	where table_name = 'entries' and row_id = entry_id and action = 'delete'
	order by synced_at desc, id desc limit 1;
	if not found or not private.can_write(deletion.household_id) then
		raise exception 'There''s no deleted Entry to restore here' using errcode = '42501';
	end if;
	if exists (select 1 from public.entries where id = entry_id) then
		raise exception 'The Entry is already back' using errcode = '23505';
	end if;
	perform set_config('hisaab.restoring', 'on', true);
	insert into public.entries select * from jsonb_populate_record(null::public.entries, deletion.before);
	for item in
		select * from public.activity_log
		where table_name = 'entry_items' and action = 'delete' and transaction_id = deletion.transaction_id
			and before ->> 'entry_id' = entry_id::text
	loop
		insert into public.entry_items select * from jsonb_populate_record(null::public.entry_items, item.before);
	end loop;
	perform set_config('hisaab.restoring', 'off', true);
end;
$$;
revoke all on function public.restore_entry(uuid) from public, anon;
grant execute on function public.restore_entry(uuid) to authenticated;
