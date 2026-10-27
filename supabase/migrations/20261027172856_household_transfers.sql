-- Cross-household transfers (ADR-0003): two mirrored Entries, one in each household, sharing a link_id, made in one
-- action by a User who belongs to both. Each half is an ordinary Entry of its own household (RLS unchanged): money
-- leaves the From Wallet in one and arrives in the To Wallet in the other. Only that User changes a linked pair. When
-- they leave either household the link breaks (link_id cleared on both halves) and each half is its household's like
-- any Entry. Expand-only: the kind check widened, a nullable column, rules only on the new kind.

alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
	check (kind in ('balance_adjustment', 'expense', 'income', 'transfer', 'loan_principal', 'repayment',
		'household_transfer'));

-- Shared by the two halves while linked; each household has one half of a pair.
alter table public.entries add column link_id uuid;
create unique index entries_one_half_per_household on public.entries (link_id, household_id) where link_id is not null;

alter table public.entries drop constraint entries_kind_shape;
alter table public.entries add constraint entries_kind_shape check (
	-- Only a half carries a link; a half whose link broke keeps its kind.
	(link_id is null or kind = 'household_transfer')
	and (
		(kind = 'balance_adjustment' and category_id is null and to_wallet_id is null and to_amount is null and loan_id is null)
		or (kind = 'expense' and category_id is not null and amount < 0 and to_wallet_id is null and to_amount is null
			and loan_id is null)
		or (kind = 'income' and category_id is not null and amount > 0 and to_wallet_id is null and to_amount is null
			and loan_id is null)
		or (kind = 'transfer' and category_id is null and amount < 0 and to_amount > 0
			and to_wallet_id is not null and to_wallet_id <> wallet_id and loan_id is null)
		or (kind in ('loan_principal', 'repayment') and loan_id is not null and category_id is null
			and to_wallet_id is null and to_amount is null and amount <> 0)
		or (kind = 'household_transfer' and category_id is null and to_wallet_id is null and to_amount is null
			and loan_id is null and amount <> 0)
	)
);

-- A linked half stays one, the same way round, and only the User who made the pair changes it. A broken one (no
-- link) is its household's.
create function private.keep_household_transfer_mirrored() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	-- Not a linked half, the server itself, a restore, a link breaking, or its household being deleted with
	-- everything in it.
	if old.link_id is null or (select auth.uid()) is null or private.restoring()
		or coalesce(current_setting('hisaab.breaking_links', true), '') = 'on'
		or not exists (select 1 from public.households where id = old.household_id) then
		if tg_op = 'DELETE' then
			return old;
		end if;
		return new;
	end if;
	if tg_op = 'UPDATE' then
		if new.kind is distinct from old.kind or new.link_id is distinct from old.link_id
			or sign(new.amount) is distinct from sign(old.amount) then
			raise exception 'A half of a cross-household transfer stays one, the same way round' using errcode = '23514';
		end if;
	end if;
	if (select auth.uid()) is distinct from old.created_by then
		raise exception 'Only whoever made a cross-household transfer changes it' using errcode = '42501';
	end if;
	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;
revoke all on function private.keep_household_transfer_mirrored() from public;
create trigger keep_household_transfer_mirrored before update or delete on public.entries
	for each row execute function private.keep_household_transfer_mirrored();

-- When its maker leaves a household (or is removed, or the household goes), the pairs they made with it break: both
-- halves lose their link, wherever they are, and each is then its household's.
create function private.break_household_transfer_links() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform set_config('hisaab.breaking_links', 'on', true);
	update public.entries set link_id = null
	where link_id in (
		select link_id from public.entries
		where household_id = old.household_id and created_by = old.user_id and link_id is not null
	);
	perform set_config('hisaab.breaking_links', 'off', true);
	return null;
end;
$$;
revoke all on function private.break_household_transfer_links() from public;
create trigger break_household_transfer_links after delete on public.memberships
	for each row execute function private.break_household_transfer_links();

-- A linked half comes back only with its other half, which lives in another household: never on its own.
create or replace function public.restore_entry(entry_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	deletion public.activity_log;
	item public.activity_log;
begin
	select * into deletion from public.activity_log
	where table_name = 'entries' and row_id = entry_id and action = 'delete' and private.can_write(household_id)
	order by synced_at desc, id desc limit 1;
	if not found then
		raise exception 'There''s no deleted Entry to restore here' using errcode = '42501';
	end if;
	if deletion.before ->> 'kind' = 'loan_principal' then
		raise exception 'A Loan''s principal comes back only with its Loan' using errcode = '23514';
	end if;
	if deletion.before ->> 'link_id' is not null then
		raise exception 'A cross-household transfer isn''t restored one half at a time' using errcode = '23514';
	end if;
	if exists (select 1 from public.entries where id = entry_id) then
		raise exception 'The Entry is already back' using errcode = '23505';
	end if;
	perform set_config('hisaab.restoring', 'on', true);
	-- The row as it was; a column added since comes back null (ADR-0009: a contract change upcasts old rows here).
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
