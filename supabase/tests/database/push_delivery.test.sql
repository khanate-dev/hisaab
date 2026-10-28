-- Push delivery: a User registers only their own devices; a Notification reaches each of its recipient's devices when
-- the trigger is on for them (their choice, else their Role's default), and none when it's off or they have none;
-- forgetting a gone target is the service role's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000044a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000044a2', 'viewer@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000044f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000044e1', '00000000-0000-7000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044a1', 'admin'),
	('00000000-0000-7000-8000-0000000044e2', '00000000-0000-7000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044a2', 'viewer');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.raise(recipient uuid, notification_trigger text) returns uuid language sql security definer as $$
	insert into public.notifications (household_id, user_id, trigger, payload)
	values ('00000000-0000-7000-8000-0000000044f1', recipient, notification_trigger, '{}') returning id;
$$;
create function pg_temp.deliveries(notification uuid) returns setof text language sql security definer as $$
	select channel || ':' || target from public.notification_deliveries where notification_id = notification order by 1;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000044a1');
select lives_ok(
	$$ insert into public.devices (id, user_id, platform, push_kind, push_token) values
	   ('00000000-0000-7000-8000-0000000044d1', (select auth.uid()), 'android', 'expo', 'ExponentPushToken[phone]'),
	   ('00000000-0000-7000-8000-0000000044d2', (select auth.uid()), 'web', 'webpush', '{"endpoint":"https://push.example/1"}') $$,
	'a User registers their devices'
);
select throws_ok(
	$$ insert into public.devices (id, user_id, platform, push_kind, push_token)
	   values ('00000000-0000-7000-8000-0000000044d3', '00000000-0000-4000-8000-0000000044a2', 'ios', 'expo', 'ExponentPushToken[x]') $$,
	'42501', null, 'but nobody else''s'
);
reset role;
insert into public.devices (id, user_id, platform, push_kind, push_token) values
	('00000000-0000-7000-8000-0000000044d4', '00000000-0000-4000-8000-0000000044a2', 'ios', 'expo', 'ExponentPushToken[viewer]');

select results_eq($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'membership')) $$,
	array['expo:ExponentPushToken[phone]', 'webpush:{"endpoint":"https://push.example/1"}'],
	'a Notification reaches each of its recipient''s devices');
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a2', 'membership')) $$,
	'not a Viewer''s for what Viewers don''t get by default');
select results_eq($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a2', 'monthly_summary')) $$,
	array['expo:ExponentPushToken[viewer]'], 'but the Monthly summary');
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'household_activity')) $$,
	'nobody''s for the activity digest unasked');
insert into public.notification_preferences (id, household_id, user_id, trigger, enabled) values
	(extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		'preference/00000000-0000-4000-8000-0000000044a1/00000000-0000-7000-8000-0000000044f1/membership'),
	 '00000000-0000-7000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044a1', 'membership', false);
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'membership')) $$,
	'nor one the User turned off');

select pg_temp.act_as('00000000-0000-4000-8000-0000000044a1');
select throws_ok($$ select public.forget_push_targets(array['ExponentPushToken[phone]']) $$, '42501', null,
	'a User can''t forget targets for the dispatcher');
reset role;
set local role service_role;
select public.forget_push_targets(array['ExponentPushToken[phone]']);
reset role;
select is((select count(*)::int from public.devices where push_token = 'ExponentPushToken[phone]'), 0,
	'the dispatcher forgets a target that''s gone');

select * from finish();
rollback;
