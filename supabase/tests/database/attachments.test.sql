-- Attachments: Admins and Members attach up to 5 images or PDFs to the household's own Entries, as themselves;
-- an Attachment stays as it was attached; files live under the household's folder in a private bucket, which only
-- its Members read and only Admins and Members write.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-00000000ffa1', 'member@example.com'),
	('00000000-0000-4000-8000-00000000ffa2', 'viewer@example.com'),
	('00000000-0000-4000-8000-00000000ffa3', 'outsider@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-00000000fff1', 'Family'),
	('00000000-0000-7000-8000-00000000fff2', 'Other');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-00000000ffe1', '00000000-0000-7000-8000-00000000fff1', '00000000-0000-4000-8000-00000000ffa1', 'member'),
	('00000000-0000-7000-8000-00000000ffe2', '00000000-0000-7000-8000-00000000fff1', '00000000-0000-4000-8000-00000000ffa2', 'viewer'),
	('00000000-0000-7000-8000-00000000ffe3', '00000000-0000-7000-8000-00000000fff2', '00000000-0000-4000-8000-00000000ffa3', 'member');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-00000000ffc1', '00000000-0000-7000-8000-00000000fff1', 'Cash', 'cash', 'PKR'),
	('00000000-0000-7000-8000-00000000ffc2', '00000000-0000-7000-8000-00000000fff2', 'Cash', 'cash', 'PKR');
insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by) values
	('00000000-0000-7000-8000-00000000ffd1', '00000000-0000-7000-8000-00000000fff1', '00000000-0000-7000-8000-00000000ffc1',
	 'balance_adjustment', 100, '2026-10-28', '00000000-0000-4000-8000-00000000ffa1'),
	('00000000-0000-7000-8000-00000000ffd2', '00000000-0000-7000-8000-00000000fff2', '00000000-0000-7000-8000-00000000ffc2',
	 'balance_adjustment', 100, '2026-10-28', '00000000-0000-4000-8000-00000000ffa3');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
	select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
	select set_config('role', 'authenticated', true);
$$;
create function pg_temp.attach(id text, entry text, media text default 'image/jpeg', bytes int default 1000) returns text
language sql as $$
	select format($f$ insert into public.attachments (id, household_id, entry_id, media_type, size_bytes, created_by)
		values (%L, '00000000-0000-7000-8000-00000000fff1', %L, %L, %s, (select auth.uid())) $f$, id, entry, media, bytes);
$$;
create function pg_temp.upload(path text) returns text language sql as $$
	select format($f$ insert into storage.objects (bucket_id, name, owner_id) values ('attachments', %L, (select auth.uid())::text) $f$, path);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-00000000ffa1');
select lives_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff01', '00000000-0000-7000-8000-00000000ffd1'),
	'a Member attaches an image to an Entry');
select lives_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff02', '00000000-0000-7000-8000-00000000ffd1', 'application/pdf', 10485760),
	'and a PDF of about 10 MB');
select throws_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff03', '00000000-0000-7000-8000-00000000ffd1', 'application/pdf', 10485761),
	'23514', null, 'but nothing bigger');
select throws_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff04', '00000000-0000-7000-8000-00000000ffd1', 'video/mp4'),
	'23514', null, 'nor anything but an image or a PDF');
select throws_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff05', '00000000-0000-7000-8000-00000000ffd2'),
	'23503', null, 'nor to another household''s Entry');
select lives_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff06', '00000000-0000-7000-8000-00000000ffd1')
	|| ';' || pg_temp.attach('00000000-0000-7000-8000-00000000ff07', '00000000-0000-7000-8000-00000000ffd1')
	|| ';' || pg_temp.attach('00000000-0000-7000-8000-00000000ff08', '00000000-0000-7000-8000-00000000ffd1'),
	'up to five on one Entry');
select throws_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff09', '00000000-0000-7000-8000-00000000ffd1'),
	'23514', null, 'and no sixth');
select lives_ok(pg_temp.attach('00000000-0000-7000-8000-00000000ff01', '00000000-0000-7000-8000-00000000ffd1')
	|| ' on conflict (id) do update set thumbnail = excluded.thumbnail',
	'a fifth re-sent by its device still lands');
select throws_ok($$ update public.attachments set size_bytes = 5 where id = '00000000-0000-7000-8000-00000000ff01' $$,
	'42501', null, 'an Attachment stays as it was attached');

-- Files.
select lives_ok(pg_temp.upload('00000000-0000-7000-8000-00000000fff1/00000000-0000-7000-8000-00000000ff01.jpg'),
	'a Member uploads a file under the household''s folder');
select throws_ok(pg_temp.upload('00000000-0000-7000-8000-00000000fff2/x.jpg'),
	'42501', null, 'but not under another household''s');

select pg_temp.act_as('00000000-0000-4000-8000-00000000ffa2');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 1, 'a Viewer reads the household''s files');
select throws_ok(pg_temp.upload('00000000-0000-7000-8000-00000000fff1/y.jpg'), '42501', null, 'but uploads none');

select pg_temp.act_as('00000000-0000-4000-8000-00000000ffa3');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments')
	+ (select count(*)::int from public.attachments where household_id = '00000000-0000-7000-8000-00000000fff1'), 0,
	'someone outside the household sees none of it');

select * from finish();
rollback;
