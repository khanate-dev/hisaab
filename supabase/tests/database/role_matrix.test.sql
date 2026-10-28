-- The Role matrix (spec §3.1): what an Admin, a Member, a Viewer, a member of another household and anon may do to
-- one household's rows, table by table. Each attempt is rolled back, so every one starts from the same rows; one that
-- errors or touches no row counts as refused. A new public table adds its rows here.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000aaa1', 'admin@example.com'),
	('00000000-0000-4000-8000-00000000aaa2', 'member@example.com'),
	('00000000-0000-4000-8000-00000000aaa3', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000aaa4', 'other@example.com'),
	('00000000-0000-4000-8000-00000000aaa5', 'second-viewer@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-00000000aaf1', 'Family'),
	('00000000-0000-7000-8000-00000000aaf2', 'Other');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000aae1', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa1', 'admin'),
	('00000000-0000-7000-8000-00000000aae2', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa2', 'member'),
	('00000000-0000-7000-8000-00000000aae3', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa3', 'viewer'),
	('00000000-0000-7000-8000-00000000aae4', '00000000-0000-7000-8000-00000000aaf2', '00000000-0000-4000-8000-00000000aaa4', 'member'),
	-- Whom the Role change and removal attempts target: nobody acting.
	('00000000-0000-7000-8000-00000000aae5', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa5', 'viewer');
insert into public.profiles (id, display_name) values
	('00000000-0000-4000-8000-00000000aaa1', 'Admin'),
	('00000000-0000-4000-8000-00000000aaa2', 'Member'),
	('00000000-0000-4000-8000-00000000aaa3', 'Viewer'),
	('00000000-0000-4000-8000-00000000aaa4', 'Other');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000aac1', '00000000-0000-7000-8000-00000000aaf1', 'Cash', 'cash', 'PKR');
insert into public.categories (id, household_id, kind, name, icon, color) values
	('00000000-0000-7000-8000-00000000aab1', '00000000-0000-7000-8000-00000000aaf1', 'expense', 'Spare', 'tag', 'red');
insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by, category_id) values
	('00000000-0000-7000-8000-00000000aad1', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aac1',
	 'balance_adjustment', 100, '2026-10-26', '00000000-0000-4000-8000-00000000aaa1', null),
	('00000000-0000-7000-8000-00000000aad2', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aac1',
	 'expense', -50, '2026-10-26', '00000000-0000-4000-8000-00000000aaa1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-00000000aaf1' and name = 'Groceries'));
insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id) values
	('00000000-0000-7000-8000-00000000aa01', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aad2',
	 0, 'Milk', 50, (select category_id from public.entries where id = '00000000-0000-7000-8000-00000000aad2'));
insert into public.contacts (id, household_id, name) values
	('00000000-0000-7000-8000-00000000aa11', '00000000-0000-7000-8000-00000000aaf1', 'Ali'),
	('00000000-0000-7000-8000-00000000aa12', '00000000-0000-7000-8000-00000000aaf1', 'Spare');
insert into public.loans (id, household_id, contact_id, direction) values
	('00000000-0000-7000-8000-00000000aa21', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aa11', 'lent');
insert into public.budgets (id, household_id, category_id, valid_from, amount) values
	('00000000-0000-7000-8000-00000000aa41', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aab1',
	 '2026-10', 100);
insert into public.budget_overrides (id, household_id, category_id, month, amount) values
	('00000000-0000-7000-8000-00000000aa51', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aab1',
	 '2026-11', 50);
insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, amount, frequency, day_of_month,
	starts_on, created_by) values
	('00000000-0000-7000-8000-00000000aa61', '00000000-0000-7000-8000-00000000aaf1', 'expense',
	 '00000000-0000-7000-8000-00000000aac1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-00000000aaf1' and name = 'Groceries'),
	 100, 'monthly', 1, '2026-10-01',
	 '00000000-0000-4000-8000-00000000aaa1');
insert into public.occurrences (id, household_id, rule_id, due_on, state, snoozed_until) values
	('e2f0dfa8-e3e5-5073-8755-1a166004d19a', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aa61',
	 '2026-10-01', 'snoozed', '2026-10-03');
insert into public.saved_filters (id, household_id, user_id, name, criteria) values
	('00000000-0000-7000-8000-00000000aa81', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa1',
	 'Mine', '{}');
insert into public.invites (id, household_id, token, role, expires_at, created_by) values
	('00000000-0000-7000-8000-00000000aa31', '00000000-0000-7000-8000-00000000aaf1', repeat('m', 32), 'member',
	 now() + interval '7 days', '00000000-0000-4000-8000-00000000aaa1');

-- Every attempt, as `table.operation` and its statement against the household's rows.
create temporary table attempts (attempt text primary key, statement text not null);
insert into attempts values
	('households.select', $$ select 1 from public.households where id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('households.insert', $$ insert into public.households (id, name, created_by) values ('00000000-0000-7000-8000-00000000ab01', 'New', (select auth.uid())) $$),
	('households.update', $$ update public.households set name = name where id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('households.delete', $$ delete from public.households where id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('memberships.select', $$ select 1 from public.memberships where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('memberships.insert', $$ insert into public.memberships (id, household_id, user_id, role)
		values ('00000000-0000-7000-8000-00000000ab02', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-4000-8000-00000000aaa4', 'admin') $$),
	('memberships.update', $$ update public.memberships set default_wallet_id = default_wallet_id
		where household_id = '00000000-0000-7000-8000-00000000aaf1' and user_id = (select auth.uid()) $$),
	('memberships.role', $$ update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-00000000aae5' $$),
	('memberships.delete', $$ delete from public.memberships where id = '00000000-0000-7000-8000-00000000aae5' $$),
	('memberships.leave', $$ delete from public.memberships
		where household_id = '00000000-0000-7000-8000-00000000aaf1' and user_id = (select auth.uid()) $$),
	('profiles.select', $$ select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000aaa1' $$),
	('profiles.update', $$ update public.profiles set display_name = display_name where id = (select auth.uid()) $$),
	('profiles.delete', $$ delete from public.profiles where id = (select auth.uid()) $$),
	('wallets.select', $$ select 1 from public.wallets where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('wallets.insert', $$ insert into public.wallets (id, household_id, name, type, currency)
		values ('00000000-0000-7000-8000-00000000ab03', '00000000-0000-7000-8000-00000000aaf1', 'New', 'cash', 'PKR') $$),
	('wallets.update', $$ update public.wallets set name = name where id = '00000000-0000-7000-8000-00000000aac1' $$),
	('wallets.delete', $$ delete from public.wallets where id = '00000000-0000-7000-8000-00000000aac1' $$),
	('categories.select', $$ select 1 from public.categories where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('categories.insert', $$ insert into public.categories (id, household_id, kind, name, icon, color)
		values ('00000000-0000-7000-8000-00000000ab04', '00000000-0000-7000-8000-00000000aaf1', 'expense', 'New', 'tag', 'red') $$),
	('categories.update', $$ update public.categories set name = name where id = '00000000-0000-7000-8000-00000000aab1' $$),
	('categories.delete', $$ delete from public.categories where id = '00000000-0000-7000-8000-00000000aab1' $$),
	('entries.select', $$ select 1 from public.entries where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('entries.insert', $$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
		values ('00000000-0000-7000-8000-00000000ab05', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aac1',
		        'balance_adjustment', 1, '2026-10-26', (select auth.uid())) $$),
	('entries.update', $$ update public.entries set amount = amount where id = '00000000-0000-7000-8000-00000000aad1' $$),
	('entries.delete', $$ delete from public.entries where id = '00000000-0000-7000-8000-00000000aad1' $$),
	('entry_items.select', $$ select 1 from public.entry_items where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('entry_items.insert', $$ insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id)
		select '00000000-0000-7000-8000-00000000ab06', household_id, entry_id, 1, 'Bread', 10, category_id from public.entry_items
		where id = '00000000-0000-7000-8000-00000000aa01' $$),
	('entry_items.update', $$ update public.entry_items set description = description where id = '00000000-0000-7000-8000-00000000aa01' $$),
	('entry_items.delete', $$ delete from public.entry_items where id = '00000000-0000-7000-8000-00000000aa01' $$),
	('contacts.select', $$ select 1 from public.contacts where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('contacts.insert', $$ insert into public.contacts (id, household_id, name)
		values ('00000000-0000-7000-8000-00000000ab07', '00000000-0000-7000-8000-00000000aaf1', 'New') $$),
	('contacts.update', $$ update public.contacts set name = name where id = '00000000-0000-7000-8000-00000000aa12' $$),
	('contacts.delete', $$ delete from public.contacts where id = '00000000-0000-7000-8000-00000000aa12' $$),
	('loans.select', $$ select 1 from public.loans where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('loans.insert', $$ insert into public.loans (id, household_id, contact_id, direction)
		values ('00000000-0000-7000-8000-00000000ab08', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aa11', 'borrowed') $$),
	('loans.update', $$ update public.loans set notes = notes where id = '00000000-0000-7000-8000-00000000aa21' $$),
	('loans.delete', $$ delete from public.loans where id = '00000000-0000-7000-8000-00000000aa21' $$),
	('budgets.select', $$ select 1 from public.budgets where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('budgets.insert', $$ insert into public.budgets (id, household_id, category_id, valid_from, amount)
		values ('00000000-0000-7000-8000-00000000ab11', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aab1', '2026-12', 1) $$),
	('budgets.update', $$ update public.budgets set amount = amount where id = '00000000-0000-7000-8000-00000000aa41' $$),
	('budgets.delete', $$ delete from public.budgets where id = '00000000-0000-7000-8000-00000000aa41' $$),
	('budget_overrides.select', $$ select 1 from public.budget_overrides where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('budget_overrides.insert', $$ insert into public.budget_overrides (id, household_id, category_id, month, amount)
		values ('00000000-0000-7000-8000-00000000ab12', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aab1', '2026-12', 1) $$),
	('budget_overrides.update', $$ update public.budget_overrides set amount = amount where id = '00000000-0000-7000-8000-00000000aa51' $$),
	('budget_overrides.delete', $$ delete from public.budget_overrides where id = '00000000-0000-7000-8000-00000000aa51' $$),
	('recurring_rules.select', $$ select 1 from public.recurring_rules where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('recurring_rules.insert', $$ insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, frequency, starts_on, created_by)
		values ('00000000-0000-7000-8000-00000000ab13', '00000000-0000-7000-8000-00000000aaf1', 'expense',
		        '00000000-0000-7000-8000-00000000aac1',
		        (select id from public.categories where household_id = '00000000-0000-7000-8000-00000000aaf1' and name = 'Groceries'),
		        'yearly', '2026-10-01', (select auth.uid())) $$),
	('recurring_rules.update', $$ update public.recurring_rules set amount = amount where id = '00000000-0000-7000-8000-00000000aa61' $$),
	('recurring_rules.delete', $$ delete from public.recurring_rules where id = '00000000-0000-7000-8000-00000000aa61' $$),
	('occurrences.select', $$ select 1 from public.occurrences where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('occurrences.insert', $$ insert into public.occurrences (id, household_id, rule_id, due_on, state)
		values ('33ab105a-b894-5b94-9498-2517333a31d8', '00000000-0000-7000-8000-00000000aaf1', '00000000-0000-7000-8000-00000000aa61', '2026-11-01', 'skipped') $$),
	('occurrences.update', $$ update public.occurrences set snoozed_until = snoozed_until where id = 'e2f0dfa8-e3e5-5073-8755-1a166004d19a' $$),
	('occurrences.delete', $$ delete from public.occurrences where id = 'e2f0dfa8-e3e5-5073-8755-1a166004d19a' $$),
	-- A Saved filter is its User's alone: the Admin's here, and anyone in the household saves their own.
	('saved_filters.select', $$ select 1 from public.saved_filters where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('saved_filters.insert', $$ insert into public.saved_filters (id, household_id, user_id, name, criteria)
		values ('00000000-0000-7000-8000-00000000ab15', '00000000-0000-7000-8000-00000000aaf1', (select auth.uid()), 'New', '{}') $$),
	('saved_filters.update', $$ update public.saved_filters set name = name where id = '00000000-0000-7000-8000-00000000aa81' $$),
	('saved_filters.delete', $$ delete from public.saved_filters where id = '00000000-0000-7000-8000-00000000aa81' $$),
	('activity_log.select', $$ select 1 from public.activity_log where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('activity_log.insert', $$ insert into public.activity_log (household_id, table_name, row_id, action)
		values ('00000000-0000-7000-8000-00000000aaf1', 'wallets', '00000000-0000-7000-8000-00000000ab09', 'insert') $$),
	('activity_log.update', $$ update public.activity_log set action = action where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('activity_log.delete', $$ delete from public.activity_log where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('invites.select', $$ select 1 from public.invites where household_id = '00000000-0000-7000-8000-00000000aaf1' $$),
	('invites.insert', $$ insert into public.invites (id, household_id, token, role, expires_at, created_by)
		values ('00000000-0000-7000-8000-00000000ab10', '00000000-0000-7000-8000-00000000aaf1', repeat('n', 32), 'viewer',
		        now() + interval '1 day', (select auth.uid())) $$),
	('invites.update', $$ update public.invites set revoked_at = now() where id = '00000000-0000-7000-8000-00000000aa31' $$),
	('invites.delete', $$ delete from public.invites where id = '00000000-0000-7000-8000-00000000aa31' $$),
	('app_config.select', $$ select 1 from public.app_config $$),
	('app_config.update', $$ update public.app_config set min_contract_version = min_contract_version $$),
	('app_config.delete', $$ delete from public.app_config $$);

-- The attempts a role gets through: each runs as them, touches at least one row, and is undone.
create function pg_temp.allowed(acting_role text, uid uuid) returns setof text language plpgsql as $$
declare
	attempt record;
	touched int;
begin
	for attempt in select * from attempts order by 1 loop
		begin
			perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', acting_role)::text, true);
			perform set_config('role', acting_role, true);
			execute attempt.statement;
			get diagnostics touched = row_count;
			-- Undone either way: the raise rolls the attempt back to this block's savepoint.
			raise exception using errcode = 'HT000', message = touched::text;
		exception
			when sqlstate 'HT000' then
				perform set_config('role', 'postgres', true);
				if sqlerrm::int > 0 then
					return next attempt.attempt;
				end if;
			when others then
				perform set_config('role', 'postgres', true);
		end;
	end loop;
end $$;

-- What every household member reads.
create function pg_temp.reads() returns text[] language sql as $$
	select array['households.select', 'memberships.select', 'profiles.select', 'wallets.select', 'categories.select',
		'entries.select', 'entry_items.select', 'contacts.select', 'loans.select', 'budgets.select', 'budget_overrides.select', 'recurring_rules.select', 'occurrences.select',
		'activity_log.select',
		'app_config.select'];
$$;
-- What Admins and Members change besides reading.
create function pg_temp.writes() returns text[] language sql as $$
	select array['households.insert', 'memberships.update', 'profiles.update',
		'wallets.insert', 'wallets.update',
		'categories.insert', 'categories.update', 'categories.delete',
		'entries.insert', 'entries.update', 'entries.delete',
		'entry_items.insert', 'entry_items.update', 'entry_items.delete',
		'contacts.insert', 'contacts.update', 'contacts.delete',
		'loans.insert', 'loans.update', 'loans.delete',
		'budgets.insert', 'budgets.update', 'budgets.delete',
		'budget_overrides.insert', 'budget_overrides.update', 'budget_overrides.delete',
		'recurring_rules.insert', 'recurring_rules.update', 'recurring_rules.delete',
		'occurrences.insert', 'occurrences.update', 'occurrences.delete'];
$$;

select set_eq(
	$$ select * from pg_temp.allowed('authenticated', '00000000-0000-4000-8000-00000000aaa1') $$,
	pg_temp.reads() || pg_temp.writes() || array['households.update', 'households.delete', 'invites.select',
		'invites.insert', 'invites.update', 'memberships.role', 'memberships.delete', 'saved_filters.select',
		'saved_filters.insert', 'saved_filters.update', 'saved_filters.delete'],
	'an Admin reads and changes everything, and alone renames or deletes the household, manages its Invites and '
		|| 'Members, but as its last Admin can''t leave'
);
select set_eq(
	$$ select * from pg_temp.allowed('authenticated', '00000000-0000-4000-8000-00000000aaa2') $$,
	pg_temp.reads() || pg_temp.writes() || array['memberships.leave', 'saved_filters.insert'],
	'a Member reads everything but Invites, records and manages the household''s money, and may leave'
);
select set_eq(
	$$ select * from pg_temp.allowed('authenticated', '00000000-0000-4000-8000-00000000aaa3') $$,
	pg_temp.reads() || array['households.insert', 'profiles.update', 'memberships.leave', 'saved_filters.insert'],
	'a Viewer only reads, beyond their own name, households of their own and leaving'
);
select set_eq(
	$$ select * from pg_temp.allowed('authenticated', '00000000-0000-4000-8000-00000000aaa4') $$,
	array['app_config.select', 'households.insert', 'profiles.update'],
	'a member of another household gets nothing of this one'
);
select is_empty(
	$$ select * from pg_temp.allowed('anon', null) $$,
	'anon gets nothing at all'
);

select * from finish();
rollback;
