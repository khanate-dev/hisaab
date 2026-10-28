-- Notifications: Membership changes in a shared household raise one each (not the founder's first Membership, a
-- Personal household or a household being deleted); the drain's functions are the service role's alone; each User
-- reads and marks read only their own inbox, and keeps only their own preferences; the jobs are scheduled.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

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
create function pg_temp.raised() returns setof text language sql security definer as $$
	select payload::jsonb ->> 'change' from private.notifications
	where household_id = '00000000-0000-7000-8000-0000000011f1' order by created_at, id;
$$;

insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000011e1', '00000000-0000-7000-8000-0000000011f1', '00000000-0000-4000-8000-0000000011a1', 'admin');
select is_empty($$ select * from pg_temp.raised() $$, 'a founder becoming the first Admin raises nothing');

insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000011e2', '00000000-0000-7000-8000-0000000011f1', '00000000-0000-4000-8000-0000000011a2', 'member');
select results_eq($$ select * from pg_temp.raised() $$, array['joined'], 'someone joining raises a Membership Notification');
select is(
	(select payload::jsonb ->> 'name' || ' / ' || (payload::jsonb ->> 'householdName') from private.notifications
	 where subject_user_id = '00000000-0000-4000-8000-0000000011a2'),
	'Bilal / Family', 'naming the person and the household, and never an amount'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000011a1');
update public.memberships set role = 'viewer' where id = '00000000-0000-7000-8000-0000000011e2';
update public.memberships set role = 'viewer' where id = '00000000-0000-7000-8000-0000000011e2';
select results_eq($$ select * from pg_temp.raised() $$, array['joined', 'role_changed'],
	'a Role change raises one; a no-op update none');
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a2');
delete from public.memberships where id = '00000000-0000-7000-8000-0000000011e2';
select results_eq($$ select * from pg_temp.raised() $$, array['joined', 'role_changed', 'left'],
	'leaving raises one');

reset role;
select is(
	(select count(*)::int from private.notifications n join public.households h on h.id = n.household_id
	 where h.personal_user_id is not null), 0, 'Personal households raise none');

-- The drain's functions.
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a1');
select throws_ok($$ select * from public.pending_notifications(10) $$, '42501', null,
	'a User can''t read the outbox');
select throws_ok($$ select public.deliver_notifications('[]', array[]::uuid[]) $$, '42501', null,
	'nor deliver from it');
reset role;
-- What a drain would deliver: every pending Notification to both Users.
create temporary table drain as
	select
		(select jsonb_agg(jsonb_build_object('notification_id', id, 'household_id', household_id, 'user_id', u,
			'channel', 'inbox', 'trigger', trigger, 'payload', payload))
		 from private.notifications,
		 unnest(array['00000000-0000-4000-8000-0000000011a1'::uuid, '00000000-0000-4000-8000-0000000011a2'::uuid]) as u)
			as deliveries,
		(select array_agg(id) from private.notifications) as drained;
grant select on drain to service_role;
set local role service_role;
select is((select count(*)::int from public.pending_notifications(10)), 3, 'the service role reads what''s pending');
select lives_ok($$ select public.deliver_notifications(deliveries, drained) from drain $$, 'and delivers it');
select is((select count(*)::int from public.pending_notifications(10)), 0, 'leaving nothing pending');
reset role;

-- Inboxes.
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a2');
select is((select count(*)::int from public.notification_deliveries), 3, 'a User reads their own inbox');
update public.notification_deliveries set read_at = now();
select throws_ok($$ update public.notification_deliveries set payload = '{}' $$, '42501', null,
	'and marks it read, but changes nothing it says');
select pg_temp.act_as('00000000-0000-4000-8000-0000000011a3');
select is((select count(*)::int from public.notification_deliveries), 0, 'nobody reads anyone else''s');
select throws_ok(
	$$ insert into public.notification_preferences (id, household_id, user_id, trigger, enabled)
	   values ('00000000-0000-7000-8000-0000000011b1', '00000000-0000-7000-8000-0000000011f1', (select auth.uid()), 'membership', false) $$,
	'42501', null, 'nor keeps preferences for a household they''re not in'
);

reset role;
select is((select count(*)::int from cron.job where jobname in ('drain-notifications', 'purge-notifications')), 2,
	'the drain runs every minute and the purge daily');

select * from finish();
rollback;
