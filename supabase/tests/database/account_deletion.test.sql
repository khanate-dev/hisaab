-- Account deletion: blocked while the sole Admin of a shared household with others in it; otherwise the Personal
-- household and shared ones with nobody else go, and everywhere else the User becomes a numbered, anonymous Former
-- member their rows point at, their pending Invites revoked, their own data and Auth user gone, the ledger written.
-- A Former member's Auto-record rules keep running. Only the service role deletes; Members read Former members.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Leaver: Admin of Shared (with Admin Ada and Viewer Vee) and alone in Solo. Blocker: sole Admin of Blocked, with Bo.
insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000077a1', 'leaver@example.com'),
	('00000000-0000-4000-8000-0000000077a2', 'ada@example.com'),
	('00000000-0000-4000-8000-0000000077a3', 'vee@example.com'),
	('00000000-0000-4000-8000-0000000077b1', 'blocker@example.com'),
	('00000000-0000-4000-8000-0000000077b2', 'bo@example.com'),
	('00000000-0000-4000-8000-0000000077c1', 'outsider@example.com');
insert into public.households (id, name, timezone, created_by) values
	('00000000-0000-7000-8000-0000000077f1', 'Shared', 'Asia/Karachi', '00000000-0000-4000-8000-0000000077a1');
insert into public.households (id, name, timezone) values
	('00000000-0000-7000-8000-0000000077f2', 'Solo', 'Asia/Karachi'),
	('00000000-0000-7000-8000-0000000077f3', 'Blocked', 'Asia/Karachi');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000077e1', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-4000-8000-0000000077a1', 'admin'),
	('00000000-0000-7000-8000-0000000077e2', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-4000-8000-0000000077a2', 'admin'),
	('00000000-0000-7000-8000-0000000077e3', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-4000-8000-0000000077a3', 'viewer'),
	('00000000-0000-7000-8000-0000000077e4', '00000000-0000-7000-8000-0000000077f2', '00000000-0000-4000-8000-0000000077a1', 'admin'),
	('00000000-0000-7000-8000-0000000077e5', '00000000-0000-7000-8000-0000000077f3', '00000000-0000-4000-8000-0000000077b1', 'admin'),
	('00000000-0000-7000-8000-0000000077e6', '00000000-0000-7000-8000-0000000077f3', '00000000-0000-4000-8000-0000000077b2', 'member');
insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-0000000077a1', 'Leila')
	on conflict (id) do update set display_name = excluded.display_name;
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000077c1', '00000000-0000-7000-8000-0000000077f1', 'Cash', 'cash', 'PKR');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
-- As the Edge Function calls it: the service role's key, no User.
create function pg_temp.as_service() returns void language sql as $$
	select set_config('request.jwt.claims', '{"role": "service_role"}', true);
	select set_config('role', 'service_role', true);
$$;

-- What the Leaver made in Shared, as themselves (so the Activity log has them as its actor).
select pg_temp.act_as('00000000-0000-4000-8000-0000000077a1');
insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by) values
	('00000000-0000-7000-8000-000000007701', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-0000000077c1',
	 'expense', -100, (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000077f1'
	 and kind = 'expense' and parent_id is null order by name limit 1), current_date, '00000000-0000-4000-8000-0000000077a1');
insert into public.attachments (id, household_id, entry_id, media_type, size_bytes, created_by) values
	('00000000-0000-7000-8000-000000007702', '00000000-0000-7000-8000-0000000077f1', '00000000-0000-7000-8000-000000007701',
	 'image/jpeg', 1000, '00000000-0000-4000-8000-0000000077a1');
insert into public.recurring_rules (id, household_id, mode, kind, wallet_id, category_id, amount, frequency, day_of_month,
	starts_on, created_by) values
	('00000000-0000-7000-8000-000000007703', '00000000-0000-7000-8000-0000000077f1', 'auto', 'expense',
	 '00000000-0000-7000-8000-0000000077c1', (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000077f1'
	 and kind = 'expense' and parent_id is null order by name limit 1), 50, 'weekly', null, current_date + 1,
	 '00000000-0000-4000-8000-0000000077a1');
insert into public.invites (id, household_id, token, role, expires_at, created_by) values
	('00000000-0000-7000-8000-000000007704', '00000000-0000-7000-8000-0000000077f1', repeat('p', 32), 'member',
	 now() + interval '7 days', '00000000-0000-4000-8000-0000000077a1');
reset role;

select is(public.delete_account('00000000-0000-4000-8000-0000000077b1'),
	'{"status": "blocked", "households": [{"name": "Blocked", "householdId": "00000000-0000-7000-8000-0000000077f3"}]}'::jsonb,
	'the sole Admin of a household with others in it is told which households are in the way');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000077b1'), 'and isn''t deleted');

select pg_temp.act_as('00000000-0000-4000-8000-0000000077a1');
select throws_ok($$ select public.delete_account('00000000-0000-4000-8000-0000000077a1') $$, '42501', null,
	'a User can''t call it themselves: the Edge Function checks the fresh OTP first');
select throws_ok($$ select * from public.account_deletion_blockers('00000000-0000-4000-8000-0000000077a1') $$, '42501',
	null, 'nor ask for the blockers');
reset role;

create temporary table leaver_log as
	select count(*) as n from public.activity_log where household_id = '00000000-0000-7000-8000-0000000077f1'
		and table_name <> 'memberships';
create temporary table personal as
	select id from public.households where personal_user_id = '00000000-0000-4000-8000-0000000077a1';
grant select on leaver_log, personal to public;

select pg_temp.as_service();
select is(public.delete_account('00000000-0000-4000-8000-0000000077a1') ->> 'status', 'deleted', 'otherwise it''s deleted');
reset role;
create temporary table former as
	select id from public.former_members where household_id = '00000000-0000-7000-8000-0000000077f1';

select ok(not exists (select 1 from public.households where id in (select id from personal)), 'their Personal household goes');
select ok(not exists (select 1 from public.households where id = '00000000-0000-7000-8000-0000000077f2'),
	'and a shared one with nobody else');
select ok(exists (select 1 from public.households where id = '00000000-0000-7000-8000-0000000077f1'), 'but not one shared with others');
select results_eq($$ select number from public.former_members where household_id = '00000000-0000-7000-8000-0000000077f1' $$,
	array[1], 'where they''re Former member 1');
select is((select created_by from public.entries where id = '00000000-0000-7000-8000-000000007701'), (select id from former),
	'their Entries are its');
select is((select created_by from public.attachments where id = '00000000-0000-7000-8000-000000007702'), (select id from former),
	'their Attachments too');
select is((select created_by || ' ' || mode from public.recurring_rules where id = '00000000-0000-7000-8000-000000007703'),
	(select id from former) || ' auto', 'and their Recurring rules, still running');
select ok(not exists (select 1 from public.activity_log where actor_id = '00000000-0000-4000-8000-0000000077a1')
	and exists (select 1 from public.activity_log where actor_id = (select id from former)),
	'the Activity log names it for what they did');
select is((select count(*) from public.activity_log where household_id = '00000000-0000-7000-8000-0000000077f1'
	and table_name <> 'memberships'), (select n from leaver_log), 'with nothing logged for moving their rows to it');
select ok((select revoked_at is not null and created_by = (select id from former) from public.invites
	where id = '00000000-0000-7000-8000-000000007704'), 'their pending Invites are revoked');
select is((select created_by from public.households where id = '00000000-0000-7000-8000-0000000077f1'),
	(select id from former), 'the household''s founder is it now');
select ok(not exists (select 1 from public.memberships where user_id = '00000000-0000-4000-8000-0000000077a1'),
	'they''re in no household');
select ok(not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000077a1')
	and not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000077a1'),
	'their Auth user and profile are gone');
select ok(not exists (select 1 from public.notifications
	where payload::jsonb ->> 'userId' = '00000000-0000-4000-8000-0000000077a1' and payload::jsonb ->> 'name' is not null),
	'and the others'' inboxes keep no name for them');
select ok(exists (select 1 from private.deletion_ledger where user_id = '00000000-0000-4000-8000-0000000077a1'),
	'the deletion ledger has them');

-- The Viewer goes too: Former member 2, in the same household.
select pg_temp.as_service();
select public.delete_account('00000000-0000-4000-8000-0000000077a3');
reset role;
select results_eq($$ select number from public.former_members where household_id = '00000000-0000-7000-8000-0000000077f1'
	order by number $$, array[1, 2], 'each deleted User is a Former member of their own');

-- The Admin who's left sees them; nobody else does, and nobody writes them.
select pg_temp.act_as('00000000-0000-4000-8000-0000000077a2');
select is((select count(*)::int from public.former_members), 2, 'Members see their household''s Former members');
select throws_ok($$ insert into public.former_members (id, household_id, number)
	values (gen_random_uuid(), '00000000-0000-7000-8000-0000000077f1', 9) $$, '42501', null, 'but can''t make one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000077c1');
select is((select count(*)::int from public.former_members), 0, 'and others see none');
reset role;

-- A Former member's Auto-record rule keeps recording, in its name.
update public.recurring_rules set starts_on = current_date - 1, created_at = now() - interval '2 days'
	where id = '00000000-0000-7000-8000-000000007703';
select private.auto_record();
select is((select count(*)::int from public.entries e join public.occurrences o on o.entry_id = e.id
	where o.rule_id = '00000000-0000-7000-8000-000000007703' and e.created_by = (select id from former)), 1,
	'Auto-record keeps recording a Former member''s rule');

select * from finish();
rollback;
