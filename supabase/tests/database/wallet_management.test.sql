-- Managing Wallets (spec §3.2): Admins and Members edit and archive them; Viewers can't; a Wallet's currency is fixed
-- once it has Entries; nothing deletes a Wallet.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000001a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000001b1', 'viewer@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000001f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000001e1', '00000000-0000-7000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001a1', 'member'),
	('00000000-0000-7000-8000-0000000001e2', '00000000-0000-7000-8000-0000000001f1', '00000000-0000-4000-8000-0000000001b1', 'viewer');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000001c1', '00000000-0000-7000-8000-0000000001f1', 'Cash', 'cash', 'PKR'),
	('00000000-0000-7000-8000-0000000001c2', '00000000-0000-7000-8000-0000000001f1', 'Visa', 'credit_card', 'USD');
insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by) values
	('00000000-0000-7000-8000-0000000001d1', '00000000-0000-7000-8000-0000000001f1', '00000000-0000-7000-8000-0000000001c1',
		'balance_adjustment', 100, '2026-10-26', '00000000-0000-4000-8000-0000000001a1');

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

select pg_temp.act_as('00000000-0000-4000-8000-0000000001b1');
select is(pg_temp.affected($$ update public.wallets set name = 'Mine' where id = '00000000-0000-7000-8000-0000000001c1' $$), 0,
	'a Viewer cannot rename a Wallet');
select is(pg_temp.affected($$ update public.wallets set archived_at = now() where id = '00000000-0000-7000-8000-0000000001c1' $$), 0,
	'a Viewer cannot archive a Wallet');

select pg_temp.act_as('00000000-0000-4000-8000-0000000001a1');
select is(pg_temp.affected($$ update public.wallets set name = 'Pocket', type = 'cash' where id = '00000000-0000-7000-8000-0000000001c1' $$), 1,
	'a Member renames a Wallet');
select is(pg_temp.affected($$ update public.wallets set archived_at = now() where id = '00000000-0000-7000-8000-0000000001c1' $$), 1,
	'a Member archives a Wallet');
select is(pg_temp.affected($$ update public.wallets set archived_at = null where id = '00000000-0000-7000-8000-0000000001c1' $$), 1,
	'a Member brings an archived Wallet back');
select throws_ok(
	$$ update public.wallets set currency = 'USD' where id = '00000000-0000-7000-8000-0000000001c1' $$,
	'23514', null, 'a Wallet''s currency is fixed once it has Entries'
);
select lives_ok(
	$$ update public.wallets set currency = 'AED' where id = '00000000-0000-7000-8000-0000000001c2' $$,
	'a Wallet without Entries can change currency'
);
select throws_ok($$ delete from public.wallets where id = '00000000-0000-7000-8000-0000000001c2' $$, '42501', null,
	'Wallets are archived, never deleted');

-- Moving an Entry to another Wallet holds that Wallet like recording one does, and its currency then locks.
select ok(
	exists (
		select 1 from pg_trigger
		where tgname = 'hold_household_for_entry' and tgrelid = 'public.entries'::regclass and tgtype & 16 <> 0
	),
	'an Entry moving Wallet holds the Wallet it moves to'
);
select is(pg_temp.affected($$ update public.entries set wallet_id = '00000000-0000-7000-8000-0000000001c2' where id = '00000000-0000-7000-8000-0000000001d1' $$), 1,
	'a Member moves an Entry to another Wallet');
select throws_ok(
	$$ update public.wallets set currency = 'EUR' where id = '00000000-0000-7000-8000-0000000001c2' $$,
	'23514', null, 'the Wallet an Entry moved to has its currency fixed'
);

select * from finish();
rollback;
