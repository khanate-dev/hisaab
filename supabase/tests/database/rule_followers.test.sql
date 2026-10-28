-- Following a Recurring rule: an Admin or Member follows (and unfollows) it for themselves, under the derived id, never
-- for someone else, and never as a Viewer; the 09:00 facts list who follows each Occurrence's rule while they're on and
-- still write there; a rule deleted takes its followers with it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000088a1', 'maker@example.com'),
	('00000000-0000-4000-8000-0000000088a2', 'member@example.com'),
	('00000000-0000-4000-8000-0000000088a3', 'viewer@example.com');
insert into public.households (id, name, timezone) values ('00000000-0000-7000-8000-0000000088f1', 'Family', 'Asia/Karachi');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000088e1', '00000000-0000-7000-8000-0000000088f1', '00000000-0000-4000-8000-0000000088a1', 'admin'),
	('00000000-0000-7000-8000-0000000088e2', '00000000-0000-7000-8000-0000000088f1', '00000000-0000-4000-8000-0000000088a2', 'member'),
	('00000000-0000-7000-8000-0000000088e3', '00000000-0000-7000-8000-0000000088f1', '00000000-0000-4000-8000-0000000088a3', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000088c1', '00000000-0000-7000-8000-0000000088f1', 'Cash', 'cash', 'PKR');
insert into public.recurring_rules (id, household_id, kind, wallet_id, category_id, amount, frequency, day_of_month,
	starts_on, created_by, created_at) values
	('00000000-0000-7000-8000-000000008811', '00000000-0000-7000-8000-0000000088f1', 'expense', '00000000-0000-7000-8000-0000000088c1',
	 (select id from public.categories where household_id = '00000000-0000-7000-8000-0000000088f1' and kind = 'expense'
	  and parent_id is null order by name limit 1), 100, 'monthly', 10, '2026-01-10', '00000000-0000-4000-8000-0000000088a1',
	 '2026-01-01');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.follow_id(uid uuid) returns uuid language sql as $$
	select extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		'follow/00000000-0000-7000-8000-000000008811/' || uid);
$$;
create function pg_temp.follow(uid uuid, on_off boolean) returns text language sql as $$
	select format($q$ insert into public.recurring_rule_followers (id, household_id, rule_id, user_id, enabled)
		values (%L, '00000000-0000-7000-8000-0000000088f1', '00000000-0000-7000-8000-000000008811', %L, %L)
		on conflict (id) do update set enabled = excluded.enabled $q$, pg_temp.follow_id(uid), uid, on_off);
$$;
create function pg_temp.followers() returns jsonb language sql security definer as $$
	select o -> 'followers' from jsonb_array_elements(public.notification_facts('2026-11-10 04:00+00')) h,
		jsonb_array_elements(h -> 'occurrences') o
	where h ->> 'householdId' = '00000000-0000-7000-8000-0000000088f1' and o ->> 'dueOn' = '2026-11-10';
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000088a2');
select lives_ok(pg_temp.follow('00000000-0000-4000-8000-0000000088a2', true), 'a Member follows a rule');
select throws_ok(pg_temp.follow('00000000-0000-4000-8000-0000000088a1', true), '42501', null, 'but not for anyone else');
select throws_ok(
	$$ insert into public.recurring_rule_followers (id, household_id, rule_id, user_id, enabled)
	   values (gen_random_uuid(), '00000000-0000-7000-8000-0000000088f1', '00000000-0000-7000-8000-000000008811',
	   '00000000-0000-4000-8000-0000000088a2', true) $$,
	'23514', null, 'and only under the derived id'
);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000088a3');
select throws_ok(pg_temp.follow('00000000-0000-4000-8000-0000000088a3', true), '42501', null, 'a Viewer can''t follow one');
select is((select count(*)::int from public.recurring_rule_followers), 0, 'nor see anyone''s follows');
reset role;

select is(pg_temp.followers(), '["00000000-0000-4000-8000-0000000088a2"]'::jsonb,
	'the 09:00 facts list who follows the rule');
select pg_temp.act_as('00000000-0000-4000-8000-0000000088a2');
select lives_ok(pg_temp.follow('00000000-0000-4000-8000-0000000088a2', false), 'turning it off is an update');
reset role;
select is(pg_temp.followers(), '[]'::jsonb, 'and then they''re not listed');

select set_config('request.jwt.claims', '', true);
update public.recurring_rule_followers set enabled = true;
update public.memberships set role = 'viewer' where id = '00000000-0000-7000-8000-0000000088e2';
select is(pg_temp.followers(), '[]'::jsonb, 'nor once they''re only a Viewer');

delete from public.recurring_rules where id = '00000000-0000-7000-8000-000000008811';
select is((select count(*)::int from public.recurring_rule_followers), 0, 'a rule deleted takes its follows with it');

select * from finish();
rollback;
