-- The Activity log (spec §3.2): every change to household data is logged with its actor, device time, sync time and
-- before/after; every Member reads it, outsiders don't; no role edits or deletes a row; a deleted Entry is restored
-- from it, Items and all.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000006a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000006b1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000006c1', 'stranger@example.com'),
	('00000000-0000-4000-8000-0000000006a2', 'admin@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000006f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000006e1', '00000000-0000-7000-8000-0000000006f1', '00000000-0000-4000-8000-0000000006a1', 'member'),
	('00000000-0000-7000-8000-0000000006e2', '00000000-0000-7000-8000-0000000006f1', '00000000-0000-4000-8000-0000000006b1', 'viewer'),
	('00000000-0000-7000-8000-0000000006e3', '00000000-0000-7000-8000-0000000006f1', '00000000-0000-4000-8000-0000000006a2', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000006c1', '00000000-0000-7000-8000-0000000006f1', 'Cash', 'cash', 'PKR');

create function pg_temp.act_as(uid uuid, device_time text default null) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('request.headers', coalesce(json_build_object('x-device-time', device_time)::text, '{}'), true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.affected(statement text) returns int language plpgsql as $$
declare n int;
begin
	execute statement;
	get diagnostics n = row_count;
	return n;
end $$;
create function pg_temp.category(category_name text) returns uuid language sql security definer as $$
	select id from public.categories where household_id = '00000000-0000-7000-8000-0000000006f1' and name = category_name;
$$;
create function pg_temp.log_of(changed uuid, what text) returns public.activity_log language sql security definer as $$
	select * from public.activity_log where row_id = changed and action = what order by synced_at desc, id desc limit 1;
$$;

-- Logging.
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', '2026-10-26T18:30:00+05:00');
insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-0000000006d1', '00000000-0000-7000-8000-0000000006f1', '00000000-0000-7000-8000-0000000006c1',
		'expense', -450, pg_temp.category('Groceries'), '2026-10-26', '00000000-0000-4000-8000-0000000006a1');
insert into public.entry_items (id, household_id, entry_id, position, description, amount, category_id) values
	('00000000-0000-7000-8000-0000000006a1', '00000000-0000-7000-8000-0000000006f1', '00000000-0000-7000-8000-0000000006d1',
		0, 'Milk', 450, pg_temp.category('Groceries'));
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'insert')).actor_id, '00000000-0000-4000-8000-0000000006a1'::uuid,
	'a change is logged with who made it');
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'insert')).device_time, '2026-10-26T13:30:00Z'::timestamptz,
	'with when it was made on the device');
select ok((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'insert')).synced_at is not null,
	'and when it reached the server');
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'insert')).after ->> 'amount', '-450',
	'and the row after');
update public.entries set notes = 'Weekly shop' where id = '00000000-0000-7000-8000-0000000006d1';
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'update')).before ->> 'notes', null,
	'an edit is logged with the row before');
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006d1', 'update')).after ->> 'notes', 'Weekly shop',
	'and the row after');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', 'not a time');
update public.wallets set name = 'Pocket' where id = '00000000-0000-7000-8000-0000000006c1';
select is((pg_temp.log_of('00000000-0000-7000-8000-0000000006c1', 'update')).device_time, null,
	'a device time that isn''t one is left out, and the change still lands');
select is(pg_temp.affected($$ update public.wallets set name = 'Pocket' where id = '00000000-0000-7000-8000-0000000006c1' $$), 1,
	'a whole-row write that changes nothing...');
select is((select count(*)::int from public.activity_log where row_id = '00000000-0000-7000-8000-0000000006c1' and action = 'update'), 1,
	'...isn''t logged as a change');

-- Reading and append-only.
select pg_temp.act_as('00000000-0000-4000-8000-0000000006b1');
select ok((select count(*) from public.activity_log) > 0, 'a Viewer reads the household''s Activity log');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006c1');
select is((select count(*)::int from public.activity_log where household_id = '00000000-0000-7000-8000-0000000006f1'), 0,
	'someone outside the household can''t read its log');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a2');
select throws_ok($$ update public.activity_log set actor_id = null $$, '42501', null, 'an Admin can''t edit the log');
select throws_ok($$ delete from public.activity_log $$, '42501', null, 'an Admin can''t delete from the log');
select throws_ok(
	$$ insert into public.activity_log (household_id, table_name, row_id, action)
	   values ('00000000-0000-7000-8000-0000000006f1', 'entries', '00000000-0000-7000-8000-0000000006d1', 'delete') $$,
	'42501', null, 'an Admin can''t write to the log'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1');
select throws_ok($$ delete from public.activity_log $$, '42501', null, 'a Member can''t delete from the log');
select throws_ok($$ update public.activity_log set before = null $$, '42501', null, 'a Member can''t edit the log');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006b1');
select throws_ok($$ update public.activity_log set before = null $$, '42501', null, 'a Viewer can''t edit the log');
select throws_ok($$ delete from public.activity_log $$, '42501', null, 'a Viewer can''t delete from the log');
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.activity_log $$, '42501', null, 'anon can''t read the log');
select throws_ok($$ delete from public.activity_log $$, '42501', null, 'anon can''t delete from the log');
-- Nor the service role or the owner: the log refuses edits from anyone.
select set_config('role', 'postgres', true);
select throws_ok($$ update public.activity_log set actor_id = null $$, '42501', null, 'not even the owner edits the log');
select throws_ok(
	$$ delete from public.activity_log where household_id = '00000000-0000-7000-8000-0000000006f1' $$,
	'42501', null, 'not even the owner deletes from a household''s log while the household stands'
);

-- Restoring a deleted Entry, with the Items deleted along with it, even into a Category archived since.
delete from public.entries where id = '00000000-0000-7000-8000-0000000006d1';
update public.categories set archived_at = now() where id = pg_temp.category('Groceries');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006b1');
select throws_ok($$ select public.restore_entry('00000000-0000-7000-8000-0000000006d1') $$, '42501', null,
	'a Viewer can''t restore an Entry');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006c1');
select throws_ok($$ select public.restore_entry('00000000-0000-7000-8000-0000000006d1') $$, '42501', null,
	'someone outside the household can''t restore its Entries');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1');
select lives_ok($$ select public.restore_entry('00000000-0000-7000-8000-0000000006d1') $$, 'a Member restores a deleted Entry');
select is(
	(select amount::text || ' ' || coalesce(notes, '') from public.entries where id = '00000000-0000-7000-8000-0000000006d1'),
	'-450 Weekly shop',
	'it comes back as it was when deleted'
);
select is((select description from public.entry_items where entry_id = '00000000-0000-7000-8000-0000000006d1'), 'Milk',
	'with the Items deleted along with it');

-- Deleting the household takes its log with it (spec §3.1).
select set_config('role', 'postgres', true);
delete from public.households where id = '00000000-0000-7000-8000-0000000006f1';
select is((select count(*)::int from public.activity_log where household_id = '00000000-0000-7000-8000-0000000006f1'), 0,
	'deleting a household deletes its Activity log');

select * from finish();
rollback;
