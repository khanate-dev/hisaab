-- A User's own settings (#53): theirs alone to read, make and change; a display currency is a currency code.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000fea1', 'alice@example.com'),
	('00000000-0000-4000-8000-00000000fea2', 'bob@example.com');

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

select pg_temp.act_as('00000000-0000-4000-8000-00000000fea1');
select lives_ok(
	$$ insert into public.user_settings (id, display_currency) values ((select auth.uid()), 'USD') $$,
	'a User picks their display currency'
);
select throws_ok(
	$$ insert into public.user_settings (id, display_currency) values ('00000000-0000-4000-8000-00000000fea2', 'PKR') $$,
	'42501', null, 'but not someone else''s'
);
select throws_ok(
	$$ update public.user_settings set display_currency = 'usd' $$,
	'23514', null, 'a display currency is a currency code'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000fea2');
select is((select count(*)::int from public.user_settings), 0, 'nobody else reads it');
select is(
	pg_temp.affected($$ update public.user_settings set display_currency = 'EUR' $$),
	0, 'or changes it'
);
select lives_ok(
	$$ insert into public.user_settings (id, display_currency) values ((select auth.uid()), null) $$,
	'one without a display currency yet is fine'
);

select * from finish();
rollback;
