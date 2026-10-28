-- Push delivery: a User registers only their own devices, taking over one left by someone else, and only real push
-- targets; a Notification reaches each of its recipient's devices when the trigger is on for them (their choice, else
-- their Role's default; someone no longer in the household, only about that), and none when it's off or they have
-- none; a forgotten device takes its unsent pushes with it; forgetting targets and Expo receipts are the service
-- role's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000044a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000044a2', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000044a3', 'former@example.com');
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
	$$ select public.register_device('00000000-0000-7000-8000-0000000044d1', 'android', 'expo', 'ExponentPushToken[phone]');
	   select public.register_device('00000000-0000-7000-8000-0000000044d2', 'web', 'webpush',
		'{"endpoint":"https://fcm.googleapis.com/fcm/send/1","keys":{}}') $$,
	'a User registers their devices'
);
select throws_ok(
	$$ insert into public.devices (id, user_id, platform, push_kind, push_token)
	   values ('00000000-0000-7000-8000-0000000044d3', '00000000-0000-4000-8000-0000000044a2', 'ios', 'expo', 'ExponentPushToken[x]') $$,
	'42501', null, 'but never as anyone else'
);
select throws_ok(
	$$ select public.register_device('00000000-0000-7000-8000-0000000044d3', 'web', 'webpush',
		'{"endpoint":"http://169.254.169.254/latest"}') $$,
	'23514', null, 'and only at a known push service over https'
);
select throws_ok(
	$$ select public.register_device('00000000-0000-7000-8000-0000000044d3', 'ios', 'expo', 'https://evil.example') $$,
	'23514', null, 'or with a real Expo token'
);
select throws_ok(
	$$ select public.register_device('00000000-0000-7000-8000-0000000044d3', 'web', 'expo', 'ExponentPushToken[web]') $$,
	'23514', null, 'on the push service its platform uses'
);
select lives_ok(
	$$ select public.register_device('00000000-0000-7000-8000-0000000044d1', 'android', 'expo', 'ExponentPushToken[phone]') $$,
	'registering again just refreshes the device'
);
reset role;

-- The Viewer signs in on a device the Admin left (their sign-out never reached the server), and on its token.
select pg_temp.act_as('00000000-0000-4000-8000-0000000044a2');
select public.register_device('00000000-0000-7000-8000-0000000044d4', 'ios', 'expo', 'ExponentPushToken[viewer]');
reset role;
insert into public.devices (id, user_id, platform, push_kind, push_token) values
	('00000000-0000-7000-8000-0000000044d5', '00000000-0000-4000-8000-0000000044a1', 'ios', 'expo', 'ExponentPushToken[shared]');
select pg_temp.act_as('00000000-0000-4000-8000-0000000044a2');
select public.register_device('00000000-0000-7000-8000-0000000044d6', 'ios', 'expo', 'ExponentPushToken[shared]');
reset role;
select is((select user_id from public.devices where push_token = 'ExponentPushToken[shared]'),
	'00000000-0000-4000-8000-0000000044a2'::uuid, 'a token left by someone else is taken over');

select results_eq($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'membership')) $$,
	array['expo:ExponentPushToken[phone]', 'webpush:{"endpoint":"https://fcm.googleapis.com/fcm/send/1","keys":{}}'],
	'a Notification reaches each of its recipient''s devices');
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a2', 'membership')) $$,
	'not a Viewer''s for what Viewers don''t get by default');
select results_eq($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a2', 'monthly_summary')) $$,
	array['expo:ExponentPushToken[shared]', 'expo:ExponentPushToken[viewer]'], 'but the Monthly summary');
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'household_activity')) $$,
	'nobody''s for the activity digest unasked');

insert into public.devices (id, user_id, platform, push_kind, push_token) values
	('00000000-0000-7000-8000-0000000044d7', '00000000-0000-4000-8000-0000000044a3', 'ios', 'expo', 'ExponentPushToken[former]');
select results_eq($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a3', 'membership')) $$,
	array['expo:ExponentPushToken[former]'], 'someone no longer in the household hears they''re out');
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a3', 'loan_due')) $$,
	'and nothing else of it');

insert into public.notification_preferences (id, household_id, user_id, trigger, enabled) values
	(extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		'preference/00000000-0000-4000-8000-0000000044a1/00000000-0000-7000-8000-0000000044f1/membership'),
	 '00000000-0000-7000-8000-0000000044f1', '00000000-0000-4000-8000-0000000044a1', 'membership', false);
select is_empty($$ select * from pg_temp.deliveries(pg_temp.raise('00000000-0000-4000-8000-0000000044a1', 'membership')) $$,
	'nor one the User turned off');

-- Signing out forgets the device; what it hadn't sent yet goes with it.
select pg_temp.act_as('00000000-0000-4000-8000-0000000044a2');
delete from public.devices where id = '00000000-0000-7000-8000-0000000044d4';
reset role;
select is((select array_agg(distinct status) from public.notification_deliveries where target = 'ExponentPushToken[viewer]'),
	array['dead'], 'a forgotten device sends nothing it had queued');

select pg_temp.act_as('00000000-0000-4000-8000-0000000044a1');
select throws_ok($$ select public.forget_push_targets(array['ExponentPushToken[phone]']) $$, '42501', null,
	'a User can''t forget targets for the dispatcher');
reset role;
set local role service_role;
select public.forget_push_targets(array['ExponentPushToken[phone]']);
reset role;
select is((select count(*)::int from public.devices where push_token = 'ExponentPushToken[phone]'), 0,
	'the dispatcher forgets a target that''s gone');

-- An Expo delivery sent with a ticket long enough ago is due for its receipt; a failed receipt makes it dead.
update public.notification_deliveries set status = 'sent', ticket_id = 'ticket-1', sent_at = now() - interval '1 hour'
where target = 'ExponentPushToken[shared]';
select pg_temp.act_as('00000000-0000-4000-8000-0000000044a1');
select throws_ok($$ select * from public.expo_receipts_due(10) $$, '42501', null, 'receipts are the dispatcher''s');
reset role;
set local role service_role;
select results_eq($$ select ticket_id from public.expo_receipts_due(10) $$, array['ticket-1'],
	'a sent Expo delivery is due for its receipt');
select public.settle_receipts(jsonb_build_array(jsonb_build_object(
	'id', (select id from public.notification_deliveries where ticket_id = 'ticket-1'), 'error', 'DeviceNotRegistered')));
reset role;
select is((select status || ':' || last_error from public.notification_deliveries where ticket_id = 'ticket-1'),
	'dead:DeviceNotRegistered', 'and dead when its receipt says it never arrived');

select * from finish();
rollback;
