-- Invites: only Admins create, read and revoke them; an Invite only ever gets revoked from a client; only
-- redeem_invite (the accept-invite function, as the service role) accepts one, once, while it's open.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000009a1', 'admin@example.com'),
	('00000000-0000-4000-8000-0000000009a2', 'member@example.com'),
	('00000000-0000-4000-8000-0000000009a3', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000009a4', 'outsider@example.com'),
	('00000000-0000-4000-8000-0000000009a5', 'joiner@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000009f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000009e1', '00000000-0000-7000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009a1', 'admin'),
	('00000000-0000-7000-8000-0000000009e2', '00000000-0000-7000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009a2', 'member'),
	('00000000-0000-7000-8000-0000000009e3', '00000000-0000-7000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009a3', 'viewer');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.affected(statement text) returns int language plpgsql as $$
declare n int;
begin
	execute statement;
	get diagnostics n = row_count;
	return n;
end $$;
-- An Invite to the household, as the User given, with a token from its last character.
create function pg_temp.invite(id text, token_end text, created_by text, extra text default '') returns text
language sql as $$
	select format(
		$q$ insert into public.invites (id, household_id, token, role, expires_at, created_by %s)
		    values (%L, '00000000-0000-7000-8000-0000000009f1', %L, 'member', now() + interval '7 days', %L %s) $q$,
		case when extra = '' then '' else ', ' || split_part(extra, '=', 1) end,
		id, repeat('a', 31) || token_end, created_by,
		case when extra = '' then '' else ', ' || split_part(extra, '=', 2) end);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000009a2');
select throws_ok(pg_temp.invite('00000000-0000-7000-8000-0000000009c9', 'z', '00000000-0000-4000-8000-0000000009a2'),
	'42501', null, 'a Member can''t create an Invite');
select pg_temp.act_as('00000000-0000-4000-8000-0000000009a1');
select lives_ok(pg_temp.invite('00000000-0000-7000-8000-0000000009c1', 'b', '00000000-0000-4000-8000-0000000009a1'),
	'an Admin creates an Invite');
select throws_ok(pg_temp.invite('00000000-0000-7000-8000-0000000009c8', 'y', '00000000-0000-4000-8000-0000000009a2'),
	'42501', null, 'in their own name only');
select throws_ok(
	pg_temp.invite('00000000-0000-7000-8000-0000000009c7', 'x', '00000000-0000-4000-8000-0000000009a1',
		'accepted_by=''00000000-0000-4000-8000-0000000009a1'''),
	'42501', null, 'and never already accepted');
select throws_ok(
	$$ insert into public.invites (id, household_id, token, role, expires_at, created_by)
	   values ('00000000-0000-7000-8000-0000000009c6', '00000000-0000-7000-8000-0000000009f1', repeat('w', 32), 'member',
	           now() + interval '60 days', '00000000-0000-4000-8000-0000000009a1') $$,
	'42501', null, 'an Invite lasts a month at most'
);
select throws_ok(
	$$ insert into public.invites (id, household_id, token, role, expires_at, created_by)
	   values ('00000000-0000-7000-8000-0000000009c5', '00000000-0000-7000-8000-0000000009f1', 'short', 'member',
	           now() + interval '1 day', '00000000-0000-4000-8000-0000000009a1') $$,
	'23514', null, 'and carries a real token'
);
select throws_ok(
	$$ insert into public.invites (id, household_id, token, role, expires_at, created_by, created_at)
	   values ('00000000-0000-7000-8000-0000000009c3', '00000000-0000-7000-8000-0000000009f1', repeat('v', 32), 'member',
	           now() + interval '1 year', '00000000-0000-4000-8000-0000000009a1', now() + interval '360 days') $$,
	'42501', null, 'nor longer by dating it ahead'
);
select throws_ok(
	$$ insert into public.invites (id, household_id, token, role, expires_at, created_by)
	   values ('00000000-0000-7000-8000-0000000009c0',
	           (select id from public.households where personal_user_id = '00000000-0000-4000-8000-0000000009a1'),
	           repeat('u', 32), 'member', now() + interval '1 day', '00000000-0000-4000-8000-0000000009a1') $$,
	'42501', null, 'nobody is invited into a Personal household'
);
select lives_ok(pg_temp.invite('00000000-0000-7000-8000-0000000009c2', 'c', '00000000-0000-4000-8000-0000000009a1',
	'email=''joiner@example.com'''), 'an Admin ties an Invite to one email');
select throws_ok(pg_temp.invite('00000000-0000-7000-8000-0000000009c4', 'd', '00000000-0000-4000-8000-0000000009a1',
	'email=''Joiner@Example.com'''), '23514', null, 'kept lower-case, as it''s compared');

-- Who reads them.
select is((select count(*)::int from public.invites), 2, 'an Admin reads the household''s Invites');
select pg_temp.act_as('00000000-0000-4000-8000-0000000009a2');
select is((select count(*)::int from public.invites), 0, 'but no Member, so no Member sees a token');
select pg_temp.act_as('00000000-0000-4000-8000-0000000009a3');
select is((select count(*)::int from public.invites), 0, 'nor a Viewer');
select pg_temp.act_as('00000000-0000-4000-8000-0000000009a4');
select is((select count(*)::int from public.invites), 0, 'nor anyone outside the household');
select throws_ok($$ select public.redeem_invite('00000000-0000-7000-8000-0000000009c1', '00000000-0000-4000-8000-0000000009a4') $$,
	'42501', null, 'and nobody signed in redeems an Invite themselves');

-- Changing them.
select pg_temp.act_as('00000000-0000-4000-8000-0000000009a1');
select throws_ok($$ update public.invites set role = 'admin' where id = '00000000-0000-7000-8000-0000000009c1' $$,
	'42501', null, 'an Invite''s Role stays as created');
select throws_ok(
	$$ update public.invites set accepted_by = '00000000-0000-4000-8000-0000000009a1', accepted_at = now()
	   where id = '00000000-0000-7000-8000-0000000009c1' $$,
	'42501', null, 'only accepting it marks it accepted');
select throws_ok($$ delete from public.invites where id = '00000000-0000-7000-8000-0000000009c1' $$,
	'42501', null, 'it isn''t deleted, only revoked');
select is(pg_temp.affected($$ update public.invites set revoked_at = now() where id = '00000000-0000-7000-8000-0000000009c2' $$),
	1, 'an Admin revokes an Invite');
select throws_ok($$ update public.invites set revoked_at = null where id = '00000000-0000-7000-8000-0000000009c2' $$,
	'42501', null, 'for good');

-- Redeeming, as the accept-invite function does.
reset role;
select is(public.redeem_invite('00000000-0000-7000-8000-0000000009c1', '00000000-0000-4000-8000-0000000009a5'),
	'00000000-0000-7000-8000-0000000009f1'::uuid, 'an open Invite is redeemed for its household');
select is((select role from public.memberships where user_id = '00000000-0000-4000-8000-0000000009a5'
	and household_id = '00000000-0000-7000-8000-0000000009f1'), 'member', 'with its Role');
select is((select actor_id from public.activity_log where table_name = 'memberships' and action = 'insert'
	and household_id = '00000000-0000-7000-8000-0000000009f1' and after ->> 'user_id' = '00000000-0000-4000-8000-0000000009a5'),
	'00000000-0000-4000-8000-0000000009a5'::uuid,
	'and the Activity log says who joined');
select is(public.redeem_invite('00000000-0000-7000-8000-0000000009c1', '00000000-0000-4000-8000-0000000009a4'),
	null, 'once');
select is(public.redeem_invite('00000000-0000-7000-8000-0000000009c2', '00000000-0000-4000-8000-0000000009a4'),
	null, 'and a revoked one not at all');
insert into public.invites (id, household_id, token, role, expires_at, created_by) values
	('00000000-0000-7000-8000-0000000009cb', '00000000-0000-7000-8000-0000000009f1', repeat('t', 32), 'admin',
	 now() + interval '1 day', '00000000-0000-4000-8000-0000000009a1');
select is(public.redeem_invite('00000000-0000-7000-8000-0000000009cb', '00000000-0000-4000-8000-0000000009a3'),
	'00000000-0000-7000-8000-0000000009f1'::uuid, 'a Member redeeming keeps their Role');
select ok((select accepted_at is null from public.invites where id = '00000000-0000-7000-8000-0000000009cb')
	and (select role from public.memberships where user_id = '00000000-0000-4000-8000-0000000009a3'
	     and household_id = '00000000-0000-7000-8000-0000000009f1') = 'viewer',
	'and leaves the Invite open for someone else');

select * from finish();
rollback;
