-- Shared households and settings: any User creates a shared household and becomes its first Admin, nobody else can
-- claim it; Admins set the Budget month start day; each Member picks only their own default Wallet, from the
-- household's Wallets; a Membership's Role doesn't change here.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000008a1', 'founder@example.com'),
	('00000000-0000-4000-8000-0000000008b1', 'other@example.com');

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
-- Counted past RLS.
create function pg_temp.category_count() returns int language sql security definer as $$
	select count(*)::int from public.categories where household_id = '00000000-0000-7000-8000-0000000008f1';
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000008a1');
select lives_ok(
	$$ insert into public.households (id, name, base_currency, timezone, created_by)
	   values ('00000000-0000-7000-8000-0000000008f1', 'Family', 'PKR', 'Asia/Karachi',
	           '00000000-0000-4000-8000-0000000008a1') $$,
	'a User creates a shared household'
);
select is((select count(*)::int from public.households where id = '00000000-0000-7000-8000-0000000008f1'), 1,
	'and reads it back before anyone belongs to it');
select throws_ok(
	$$ insert into public.households (id, name, created_by)
	   values ('00000000-0000-7000-8000-0000000008f2', 'Theirs', '00000000-0000-4000-8000-0000000008b1') $$,
	'42501', null, 'nobody creates a household in someone else''s name'
);
select throws_ok(
	$$ insert into public.households (id, name, personal_user_id, created_by)
	   values ('00000000-0000-7000-8000-0000000008f3', 'Personal', '00000000-0000-4000-8000-0000000008a1',
	           '00000000-0000-4000-8000-0000000008a1') $$,
	'42501', null, 'nor a second Personal household'
);

-- Another User who learns the id can't take it over before the founder joins.
select pg_temp.act_as('00000000-0000-4000-8000-0000000008b1');
select is((select count(*)::int from public.households where id = '00000000-0000-7000-8000-0000000008f1'), 0,
	'someone else can''t read a household being founded');
select throws_ok(
	$$ insert into public.memberships (id, household_id, user_id, role)
	   values ('00000000-0000-7000-8000-0000000008e9', '00000000-0000-7000-8000-0000000008f1',
	           '00000000-0000-4000-8000-0000000008b1', 'admin') $$,
	'42501', null, 'nor become its first Admin'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000008a1');
select throws_ok(
	$$ insert into public.memberships (id, household_id, user_id, role)
	   values ('00000000-0000-7000-8000-0000000008e2', '00000000-0000-7000-8000-0000000008f1',
	           '00000000-0000-4000-8000-0000000008a1', 'member') $$,
	'42501', null, 'the founder joins as Admin, nothing less'
);
select lives_ok(
	$$ insert into public.memberships (id, household_id, user_id, role)
	   values ('00000000-0000-7000-8000-0000000008e1', '00000000-0000-7000-8000-0000000008f1',
	           '00000000-0000-4000-8000-0000000008a1', 'admin') $$,
	'the founder becomes its first Admin'
);
select ok(pg_temp.category_count() > 0, 'the new household gets the template Categories');
select throws_ok(
	$$ insert into public.memberships (id, household_id, user_id, role)
	   values ('00000000-0000-7000-8000-0000000008e3', '00000000-0000-7000-8000-0000000008f1',
	           '00000000-0000-4000-8000-0000000008b1', 'member') $$,
	'42501', null, 'once founded, nobody is added outside an Invite'
);
select throws_ok(
	$$ update public.households set created_by = '00000000-0000-4000-8000-0000000008b1'
	   where id = '00000000-0000-7000-8000-0000000008f1' $$,
	'42501', null, 'who created a household stays the same'
);

-- Settings.
select is(pg_temp.affected($$ update public.households set budget_month_start_day = 25
	where id = '00000000-0000-7000-8000-0000000008f1' $$), 1, 'an Admin sets the Budget month start day');
select throws_ok(
	$$ update public.households set budget_month_start_day = 29 where id = '00000000-0000-7000-8000-0000000008f1' $$,
	'23514', null, 'which is at most the 28th'
);
select is(pg_temp.affected($$ update public.households set timezone = 'Europe/London', base_currency = 'GBP'
	where id = '00000000-0000-7000-8000-0000000008f1' $$), 1,
	'an Admin sets the timezone and, before any Entry, the Base currency');

-- Default Wallets.
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000008c1', '00000000-0000-7000-8000-0000000008f1', 'Cash', 'cash', 'GBP'),
	('00000000-0000-7000-8000-0000000008c2',
	 (select id from public.households where personal_user_id = '00000000-0000-4000-8000-0000000008a1'), 'Mine', 'cash', 'PKR');
select is(pg_temp.affected($$ update public.memberships set default_wallet_id = '00000000-0000-7000-8000-0000000008c1'
	where id = '00000000-0000-7000-8000-0000000008e1' $$), 1, 'a Member picks their default Wallet');
select throws_ok(
	$$ update public.memberships set role = 'viewer' where id = '00000000-0000-7000-8000-0000000008e1' $$,
	'42501', null, 'but not their Role'
);
select throws_ok(
	$$ update public.memberships set default_wallet_id = '00000000-0000-7000-8000-0000000008c2'
	   where id = '00000000-0000-7000-8000-0000000008e1' $$,
	'23503', null, 'a default Wallet is one of the household''s own'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000008b1');
select is(pg_temp.affected($$ update public.memberships set default_wallet_id = null
	where id = '00000000-0000-7000-8000-0000000008e1' $$), 0, 'nobody picks someone else''s default Wallet');

reset role;
delete from public.wallets where id = '00000000-0000-7000-8000-0000000008c1';
select is((select default_wallet_id from public.memberships where id = '00000000-0000-7000-8000-0000000008e1'), null,
	'a Wallet that goes takes the default with it');
select is((select role from public.memberships where id = '00000000-0000-7000-8000-0000000008e1'), 'admin',
	'and leaves the Membership otherwise as it was');

select * from finish();
rollback;
