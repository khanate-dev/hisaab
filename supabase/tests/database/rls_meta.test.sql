-- RLS is the authority (ADR-0007): every table in `public` has RLS enabled and at least one policy.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

create temp view public_tables as
	select
		c.relname as table_name,
		c.relrowsecurity as has_rls,
		exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as has_policy
	from pg_class c
	join pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public' and c.relkind in ('r', 'p');

-- Self-check: the assertions below would catch an unprotected table.
savepoint probe;
create table public.meta_probe (id int primary key);
select results_eq(
	$$ select table_name::text collate "C" from public_tables where not has_rls $$,
	$$ values ('meta_probe' collate "C") $$,
	'a table without RLS is detected'
);
alter table public.meta_probe enable row level security;
select results_eq(
	$$ select table_name::text collate "C" from public_tables where not has_policy $$,
	$$ values ('meta_probe' collate "C") $$,
	'a table with RLS but no policy is detected'
);
rollback to savepoint probe;

select is_empty($$ select table_name from public_tables where not has_rls $$, 'every public table has RLS enabled');
select is_empty(
	$$ select table_name from public_tables where not has_policy $$,
	'every public table has at least one policy'
);

select * from finish();
rollback;
