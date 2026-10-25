-- ADR-0009: app_config is readable by every User, and too-old clients get HTTP 426 before any query runs.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is(
	(select min_contract_version from public.app_config),
	1,
	'app_config holds the minimum contract version'
);

create function pg_temp.request_with(contract_version text) returns void language sql as $$
	select set_config(
		'request.headers',
		case when contract_version is null then '{}' else json_build_object('x-contract-version', contract_version)::text end,
		true
	);
$$;

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select set_config('role', 'authenticated', true);

select pg_temp.request_with(null);
select throws_ok('select private.check_contract_version()', 'PT426', null, 'a request without the header is refused');
select pg_temp.request_with('0');
select throws_ok('select private.check_contract_version()', 'PT426', null, 'an older contract version is refused');
select pg_temp.request_with('one');
select throws_ok('select private.check_contract_version()', 'PT426', null, 'a malformed version is refused');
select pg_temp.request_with('1');
select lives_ok('select private.check_contract_version()', 'the current contract version passes');
select pg_temp.request_with('2');
select lives_ok('select private.check_contract_version()', 'a newer client passes');

select results_eq($$ select id from public.app_config $$, $$ values ('app') $$, 'a User reads app_config');
select throws_ok(
	$$ update public.app_config set min_contract_version = 0 $$,
	'42501',
	null,
	'a User cannot change app_config'
);

select pg_temp.request_with('9999999999');
select throws_ok('select private.check_contract_version()', 'PT426', null, 'a version too long to be one is refused');

reset role;
select set_config('role', 'service_role', true);
select pg_temp.request_with(null);
select lives_ok('select private.check_contract_version()', 'server-side callers on the service role are not gated');

reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.app_config $$, '42501', null, 'anon cannot read app_config');

-- Fail closed: without its row, the gate refuses everyone rather than letting every build through.
reset role;
delete from public.app_config;
select set_config('role', 'authenticated', true);
select pg_temp.request_with('1');
select throws_ok('select private.check_contract_version()', 'PT503', null, 'a missing app_config row refuses requests');

select * from finish();
rollback;
