-- Contacts, Loans and Repayments (spec §3.2): Money Lent to or Borrowed from a household Contact. The principal and
-- each Repayment are Entries; the outstanding amount is derived (never stored); a Loan settles at zero or by
-- write-off; no interest. Expand-only: new tables, the kind check widened, a nullable column, rules only on the new
-- kinds.

create table public.contacts (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	name text not null check (char_length(btrim(name)) between 1 and 80),
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	unique (id, household_id)
);
create index contacts_household_id_idx on public.contacts (household_id);
alter table public.contacts enable row level security;
create policy "Members read their households' Contacts" on public.contacts
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members add Contacts" on public.contacts
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members edit Contacts" on public.contacts
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members delete unused Contacts" on public.contacts
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.contacts from anon, authenticated;
grant select, insert, update, delete on public.contacts to authenticated;

create table public.loans (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- No `on delete set null`: a Contact with a Loan is in use, so it's archived, never deleted.
	contact_id uuid not null,
	direction text not null check (direction in ('lent', 'borrowed')),
	due_on date,
	-- Settled by writing off what's left; null while it isn't.
	written_off_at timestamptz,
	notes text check (char_length(notes) <= 1000),
	created_at timestamptz not null default now(),
	unique (id, household_id),
	foreign key (contact_id, household_id) references public.contacts (id, household_id)
);
create index loans_household_id_idx on public.loans (household_id);
create index loans_contact_id_idx on public.loans (contact_id);
alter table public.loans enable row level security;
create policy "Members read their households' Loans" on public.loans
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members add Loans" on public.loans
	for insert to authenticated with check (private.can_write(household_id));
create policy "Admins and Members edit Loans" on public.loans
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members delete Loans" on public.loans
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.loans from anon, authenticated;
grant select, insert, update, delete on public.loans to authenticated;

-- A Contact stays in its household (ADR-0001); whole-row updates must leave its origin alone.
create function private.keep_contact_origin() returns trigger
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
revoke all on function private.keep_contact_origin() from public;
create trigger keep_contact_origin before update on public.contacts
	for each row execute function private.keep_contact_origin();

-- A Loan stays in its household and stays Lent or Borrowed.
create function private.keep_loan_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_at is distinct from old.created_at or new.direction is distinct from old.direction then
		raise exception 'id, household_id, created_at and direction cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_loan_origin() from public;
create trigger keep_loan_origin before update on public.loans
	for each row execute function private.keep_loan_origin();

-- The Loan's principal and Repayments are Entries pointing at it.
alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
	check (kind in ('balance_adjustment', 'expense', 'income', 'transfer', 'loan_principal', 'repayment'));
alter table public.entries add column loan_id uuid;
-- No cascade: a Loan goes only once its Entries have (the app deletes them with it).
alter table public.entries add constraint entries_loan_id_household_id_fkey
	foreign key (loan_id, household_id) references public.loans (id, household_id);
create index entries_loan_id_idx on public.entries (loan_id);
-- One principal per Loan.
create unique index entries_one_principal_per_loan on public.entries (loan_id) where kind = 'loan_principal';

alter table public.entries drop constraint entries_kind_shape;
alter table public.entries add constraint entries_kind_shape check (
	(kind = 'balance_adjustment' and category_id is null and to_wallet_id is null and to_amount is null and loan_id is null)
	or (kind = 'expense' and category_id is not null and amount < 0 and to_wallet_id is null and to_amount is null
		and loan_id is null)
	or (kind = 'income' and category_id is not null and amount > 0 and to_wallet_id is null and to_amount is null
		and loan_id is null)
	or (kind = 'transfer' and category_id is null and amount < 0 and to_amount > 0
		and to_wallet_id is not null and to_wallet_id <> wallet_id and loan_id is null)
	or (kind in ('loan_principal', 'repayment') and loan_id is not null and category_id is null
		and to_wallet_id is null and to_amount is null and amount <> 0)
);

-- Money Lent leaves the Wallet and its Repayments come back; money Borrowed arrives and its Repayments leave. And no
-- Entry takes a Loan past zero: Repayments never add up to more than the principal, whichever order they arrive in.
create function private.keep_loan_entry_signed() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	loan_direction text;
	leaves boolean;
	net numeric;
begin
	if new.loan_id is null then
		return new;
	end if;
	select direction into loan_direction from public.loans where id = new.loan_id and household_id = new.household_id
	for update;
	if not found then
		return new;
	end if;
	leaves := (loan_direction = 'lent') = (new.kind = 'loan_principal');
	if (leaves and new.amount >= 0) or (not leaves and new.amount <= 0) then
		raise exception 'A Loan''s principal and Repayments go the way it was Lent or Borrowed' using errcode = '23514';
	end if;
	select coalesce(sum(amount), 0) + new.amount into net from public.entries
	where loan_id = new.loan_id and household_id = new.household_id and id <> new.id;
	-- The Entries' sum is minus what's outstanding on money Lent, and plus it on money Borrowed.
	if (loan_direction = 'lent' and net > 0) or (loan_direction = 'borrowed' and net < 0) then
		raise exception 'Repayments add up to more than the Loan' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_loan_entry_signed() from public;
create trigger keep_loan_entry_signed
	before insert or update of kind, amount, loan_id on public.entries
	for each row execute function private.keep_loan_entry_signed();

-- A Loan's principal comes back only with its Loan, never on its own (the Loan has one already, or is gone).
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

create trigger log_activity after insert or update or delete on public.contacts
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.loans
	for each row execute function private.log_activity();
