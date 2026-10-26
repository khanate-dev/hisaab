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

-- Contacts and Loans stay in their household (ADR-0001), and a Loan stays Lent or Borrowed.
create function private.keep_loan_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_at is distinct from old.created_at
		or (tg_table_name = 'loans' and to_jsonb(new) ->> 'direction' is distinct from to_jsonb(old) ->> 'direction') then
		raise exception 'id, household_id, created_at and a Loan''s direction cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_loan_origin() from public;
create trigger keep_contact_origin before update on public.contacts
	for each row execute function private.keep_loan_origin();
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

-- Money Lent leaves the Wallet and its Repayments come back; money Borrowed arrives and its Repayments leave.
create function private.keep_loan_entry_signed() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	loan_direction text;
	leaves boolean;
begin
	if new.loan_id is null then
		return new;
	end if;
	select direction into loan_direction from public.loans where id = new.loan_id and household_id = new.household_id;
	if not found then
		return new;
	end if;
	leaves := (loan_direction = 'lent') = (new.kind = 'loan_principal');
	if (leaves and new.amount >= 0) or (not leaves and new.amount <= 0) then
		raise exception 'A Loan''s principal and Repayments go the way it was Lent or Borrowed' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_loan_entry_signed() from public;
create trigger keep_loan_entry_signed
	before insert or update of kind, amount, loan_id on public.entries
	for each row execute function private.keep_loan_entry_signed();

create trigger log_activity after insert or update or delete on public.contacts
	for each row execute function private.log_activity();
create trigger log_activity after insert or update or delete on public.loans
	for each row execute function private.log_activity();
