-- Notifications: Membership changes in a shared household reach its Admins' and the affected person's inboxes, as one
-- row each (not the founder's first Membership, a Personal household or a household being deleted); each User reads
-- and marks read only their own; the push outbox is the service role's to claim and settle; preferences have the
-- derived id, one per User, household and trigger; the jobs are scheduled.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000011a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000011a2', 'member@example.com'),
	('00000000-0000-4000-8000-0000000011a3', 'outsider@example.com');
insert into public.profiles (id, display_name) values
	('00000000-0000-4000-8000-0000000011a1', 'Ayesha'),
	('00000000-0000-4000-8000-0000000011a2', 'Bilal');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000011f1', 'Family');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
-- Each inbox row as `recipient: change`, past RLS.
create function pg_temp.inboxes() returns setof text language sql security definer as $$
	select (select display_name from public.profiles where id = user_id) || ': ' || (payload::jsonb ->> 'change')
	from public.notifications where household_id = '00000000-0000-7000-8000-0000000011f1' order by created_at, id, user_id;
$$;

insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000011e1', '00000000-0000-7000-8000-0000000011f1', '00000000-0000-4000-8000-0000000011a1', 'admin');
select is_empty($$ select * from pg_temp.inboxes() $$, 'a founder becoming the first Admin raises nothing');

insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000011e2', '00000000-0000-7000-8000-0000000011f1', '00000000-0000-4000-8000-0000000011a2', 'viewer');
select set_eq($$ select * from pg_temp.inboxes() $$, array['Ayesha: joined', 'Bilal: joined'],
	'someone joining reaches the Admins and themselves, a Viewer included');
select is(
	(select payload::jsonb ->> 'name' || ' / ' || (payload::jsonb ->> 'householdName') from public.notifications
	 where user_id = '00000000-0000-4000-8000-0000000011a1'),
	'Bilal / Family', 'naming the person and the household, and never an amount'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000011a1');
update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-0000000011e2';
update public.memberships set role = 'member' where id = '00000000-0000-7000-8000-0000000011e2';
select is((select count(*)::int from pg_temp.inboxes() as change where change like '%role_changed'), 2,
	'a Role change reaches both; a no-op update raises nothing');
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a2');
delete from public.memberships where id = '00000000-0000-7000-8000-0000000011e2';
select is((select count(*)::int from pg_temp.inboxes() as change where change like '%: left'), 2,
	'leaving reaches the Admins and the person who left');

reset role;
select is(
	(select count(*)::int from public.notifications n join public.households h on h.id = n.household_id
	 where h.personal_user_id is not null), 0, 'Personal households raise none');

-- Inboxes.
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a2');
select is((select count(*)::int from public.notifications where household_id = '00000000-0000-7000-8000-0000000011f1'), 3,
	'a User reads their own inbox, even after leaving the household');
update public.notifications set read_at = now();
select is((select count(*)::int from public.notifications where read_at is null), 0, 'and marks it read');
select throws_ok($$ update public.notifications set payload = '{}' $$, '42501', null, 'but changes nothing it says');
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a3');
select is((select count(*)::int from public.notifications), 0, 'nobody reads anyone else''s');

-- The push outbox.
reset role;
insert into public.notification_deliveries (id, notification_id, user_id, channel, target)
select '00000000-0000-7000-8000-0000000011d1', id, user_id, 'expo', 'ExponentPushToken[x]'
from public.notifications where user_id = '00000000-0000-4000-8000-0000000011a1' order by created_at limit 1;
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a1');
select throws_ok($$ select * from public.claim_deliveries(10) $$, '42501', null, 'a User can''t claim deliveries');
reset role;
set local role service_role;
select is((select attempts from public.claim_deliveries(10) where id = '00000000-0000-7000-8000-0000000011d1'), 1,
	'the service role claims a due delivery, counting the attempt');
select is((select count(*)::int from public.claim_deliveries(10) where id = '00000000-0000-7000-8000-0000000011d1'), 0,
	'and a claimed one isn''t due again until its backoff passes');
select lives_ok($$ select public.settle_deliveries('[{"id": "00000000-0000-7000-8000-0000000011d1", "status": "sent", "error": null}]') $$,
	'then settles it');
reset role;
select is((select status from public.notification_deliveries where id = '00000000-0000-7000-8000-0000000011d1'), 'sent', 'as sent');

-- Preferences.
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a1');
select lives_ok(
	$$ insert into public.notification_preferences (id, household_id, user_id, trigger, enabled)
	   values ('c77a5500-dcc4-50a2-b152-7d77342f026a', '00000000-0000-7000-8000-0000000011f1', (select auth.uid()), 'membership', false) $$,
	'a User sets a preference under its derived id'
);
select throws_ok(
	$$ insert into public.notification_preferences (id, household_id, user_id, trigger, enabled)
	   values ('00000000-0000-7000-8000-0000000011b1', '00000000-0000-7000-8000-0000000011f1', (select auth.uid()), 'loan_due', false) $$,
	'23514', null, 'and under no other'
);

reset role;
select is((select count(*)::int from cron.job where jobname in ('dispatch-notifications', 'purge-notifications')), 2,
	'the dispatcher runs every minute and the purge daily');

select * from finish();
rollback;
