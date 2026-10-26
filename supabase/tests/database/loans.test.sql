-- Contacts and Loans (spec §3.2): Admins and Members keep Contacts and record Loans; Viewers, outsiders and anon
-- can't; a Loan's principal and Repayments go the way it was Lent or Borrowed; one principal per Loan; a Contact or
-- Loan in use isn't deleted; a Loan stays Lent or Borrowed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-0000000007a1', 'member@example.com'),
	('00000000-0000-4000-8000-0000000007b1', 'viewer@example.com'),
	('00000000-0000-4000-8000-0000000007c1', 'stranger@example.com'),
	('00000000-0000-4000-8000-0000000007a2', 'admin@example.com');
insert into public.households (id, name) values ('00000000-0000-7000-8000-0000000007f1', 'Family');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000007e1', '00000000-0000-7000-8000-0000000007f1', '00000000-0000-4000-8000-0000000007a1', 'member'),
	('00000000-0000-7000-8000-0000000007e2', '00000000-0000-7000-8000-0000000007f1', '00000000-0000-4000-8000-0000000007b1', 'viewer'),
	('00000000-0000-7000-8000-0000000007e3', '00000000-0000-7000-8000-0000000007f1', '00000000-0000-4000-8000-0000000007a2', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000007c1', '00000000-0000-7000-8000-0000000007f1', 'Cash', 'cash', 'PKR');

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
-- Records a Loan Entry as the Member: its id, kind, signed amount and Loan.
create function pg_temp.loan_entry(id text, kind text, amount numeric, loan text) returns text language sql as $$
	select format(
		$q$ insert into public.entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by)
		    values (%L, '00000000-0000-7000-8000-0000000007f1', '00000000-0000-7000-8000-0000000007c1', %L, %s, %L,
		            '2026-10-26', '00000000-0000-4000-8000-0000000007a1') $q$,
		id, kind, amount, loan);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000007a1');
select lives_ok(
	$$ insert into public.contacts (id, household_id, name)
	   values ('00000000-0000-7000-8000-0000000007b1', '00000000-0000-7000-8000-0000000007f1', 'Ali') $$,
	'a Member adds a Contact'
);
select lives_ok(
	$$ insert into public.loans (id, household_id, contact_id, direction, due_on)
	   values ('00000000-0000-7000-8000-0000000007d1', '00000000-0000-7000-8000-0000000007f1',
	           '00000000-0000-7000-8000-0000000007b1', 'lent', '2026-12-31'),
	          ('00000000-0000-7000-8000-0000000007d2', '00000000-0000-7000-8000-0000000007f1',
	           '00000000-0000-7000-8000-0000000007b1', 'borrowed', null) $$,
	'a Member records a Loan Lent and one Borrowed'
);
select lives_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e1', 'loan_principal', -1000, '00000000-0000-7000-8000-0000000007d1'),
	'money Lent leaves the Wallet');
select lives_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e2', 'repayment', 300, '00000000-0000-7000-8000-0000000007d1'),
	'and its Repayments come back');
select lives_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e3', 'loan_principal', 500, '00000000-0000-7000-8000-0000000007d2'),
	'money Borrowed arrives');
select throws_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e4', 'repayment', 100, '00000000-0000-7000-8000-0000000007d2'),
	'23514', null, 'a Repayment of money Borrowed leaves the Wallet');
select throws_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e5', 'loan_principal', 1000, '00000000-0000-7000-8000-0000000007d1'),
	'23514', null, 'a principal goes the way the Loan went');
select throws_ok(pg_temp.loan_entry('00000000-0000-7000-8000-0000000007e6', 'loan_principal', -10, '00000000-0000-7000-8000-0000000007d1'),
	'23505', null, 'a Loan has one principal');
select throws_ok(
	$$ insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by)
	   values ('00000000-0000-7000-8000-0000000007e7', '00000000-0000-7000-8000-0000000007f1', '00000000-0000-7000-8000-0000000007c1',
	           'repayment', 10, '2026-10-26', '00000000-0000-4000-8000-0000000007a1') $$,
	'23514', null, 'a Repayment belongs to a Loan'
);
select throws_ok(
	$$ update public.loans set direction = 'borrowed' where id = '00000000-0000-7000-8000-0000000007d1' $$,
	'42501', null, 'a Loan stays Lent or Borrowed'
);
select is(pg_temp.affected($$ update public.loans set written_off_at = now() where id = '00000000-0000-7000-8000-0000000007d1' $$), 1,
	'a Member writes a Loan off');
select throws_ok($$ delete from public.contacts where id = '00000000-0000-7000-8000-0000000007b1' $$, '23503', null,
	'a Contact with a Loan isn''t deleted');
select throws_ok($$ delete from public.loans where id = '00000000-0000-7000-8000-0000000007d1' $$, '23503', null,
	'a Loan with Entries isn''t deleted until they are');

-- Viewers, outsiders and anon. (Former members join with account deletion, #64.)
select pg_temp.act_as('00000000-0000-4000-8000-0000000007b1');
select ok((select count(*) from public.loans) = 2, 'a Viewer reads the household''s Loans');
select throws_ok(
	$$ insert into public.contacts (id, household_id, name)
	   values ('00000000-0000-7000-8000-0000000007b2', '00000000-0000-7000-8000-0000000007f1', 'Sara') $$,
	'42501', null, 'a Viewer can''t add a Contact'
);
select is(pg_temp.affected($$ update public.loans set notes = 'x' $$), 0, 'a Viewer can''t edit a Loan');
select pg_temp.act_as('00000000-0000-4000-8000-0000000007c1');
select is((select count(*)::int from public.contacts where household_id = '00000000-0000-7000-8000-0000000007f1'), 0,
	'someone outside the household can''t read its Contacts');
select is(pg_temp.affected($$ delete from public.loans $$), 0, 'someone outside the household can''t delete its Loans');
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.loans $$, '42501', null, 'anon can''t read Loans');

-- An Admin deletes a Loan once its Entries are gone.
select pg_temp.act_as('00000000-0000-4000-8000-0000000007a2');
delete from public.entries where loan_id = '00000000-0000-7000-8000-0000000007d2';
select is(pg_temp.affected($$ delete from public.loans where id = '00000000-0000-7000-8000-0000000007d2' $$), 1,
	'an Admin deletes a Loan with its Entries gone');

select * from finish();
rollback;
