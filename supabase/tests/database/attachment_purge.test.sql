-- Attachment purge: due are the files of Entries deleted 90 days ago or more (their rows marked, not deleted), of
-- Attachments removed 90 days ago or more, and of deleted households at once; never a live Entry's, a recent deletion's,
-- or anything already purged. Only the service role sees the list or marks rows.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000033a1', 'member@example.com');
insert into public.households (id, name) values
	('00000000-0000-7000-8000-0000000033f1', 'Family'),
	('00000000-0000-7000-8000-0000000033f2', 'Gone');
insert into public.memberships (id, household_id, user_id, role) values
	('00000000-0000-7000-8000-0000000033e1', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-4000-8000-0000000033a1', 'admin');
insert into public.wallets (id, household_id, name, type, currency) values
	('00000000-0000-7000-8000-0000000033c1', '00000000-0000-7000-8000-0000000033f1', 'Cash', 'cash', 'PKR');
insert into public.entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by) values
	('00000000-0000-7000-8000-0000000033d1', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033c1',
	 'balance_adjustment', 1, '2026-01-01', '00000000-0000-4000-8000-0000000033a1'),
	('00000000-0000-7000-8000-0000000033d2', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033c1',
	 'balance_adjustment', 2, '2026-01-01', '00000000-0000-4000-8000-0000000033a1'),
	('00000000-0000-7000-8000-0000000033d3', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033c1',
	 'balance_adjustment', 3, '2026-01-01', '00000000-0000-4000-8000-0000000033a1');
-- One on a live Entry, one on an Entry deleted long ago, one on an Entry deleted yesterday, and one removed long ago.
insert into public.attachments (id, household_id, entry_id, media_type, size_bytes, created_by) values
	('00000000-0000-7000-8000-000000003301', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033d1', 'image/jpeg', 1, '00000000-0000-4000-8000-0000000033a1'),
	('00000000-0000-7000-8000-000000003302', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033d2', 'application/pdf', 1, '00000000-0000-4000-8000-0000000033a1'),
	('00000000-0000-7000-8000-000000003303', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033d3', 'image/png', 1, '00000000-0000-4000-8000-0000000033a1'),
	('00000000-0000-7000-8000-000000003304', '00000000-0000-7000-8000-0000000033f1', '00000000-0000-7000-8000-0000000033d1', 'image/jpeg', 1, '00000000-0000-4000-8000-0000000033a1');
insert into storage.objects (bucket_id, name) values
	('attachments', '00000000-0000-7000-8000-0000000033f1/00000000-0000-7000-8000-000000003301.jpg'),
	('attachments', '00000000-0000-7000-8000-0000000033f1/00000000-0000-7000-8000-000000003302.pdf'),
	('attachments', '00000000-0000-7000-8000-0000000033f1/00000000-0000-7000-8000-000000003303.png'),
	('attachments', '00000000-0000-7000-8000-0000000033f1/00000000-0000-7000-8000-000000003304.jpg'),
	('attachments', '00000000-0000-7000-8000-0000000033f2/00000000-0000-7000-8000-000000003305.jpg');
delete from public.entries where id in ('00000000-0000-7000-8000-0000000033d2', '00000000-0000-7000-8000-0000000033d3');
delete from public.attachments where id = '00000000-0000-7000-8000-000000003304';
delete from public.households where id = '00000000-0000-7000-8000-0000000033f2';
-- Long ago, for the Entry deleted long ago and the Attachment removed long ago.
set local session_replication_role = replica;
update public.activity_log set synced_at = now() - interval '100 days'
where row_id in ('00000000-0000-7000-8000-0000000033d2', '00000000-0000-7000-8000-000000003304') and action = 'delete';
set local session_replication_role = origin;

set local role service_role;
create temporary table due as select * from public.attachments_to_purge(100);
reset role;
create function pg_temp.due(path_like text) returns boolean language sql as $$
	select exists (select 1 from due where path like path_like);
$$;

select ok(pg_temp.due('%3302.pdf'), 'an Entry deleted 90 days ago or more has its file due');
select is((select attachment_id from due where path like '%3302.pdf'), '00000000-0000-7000-8000-000000003302'::uuid,
	'with its row to mark, not delete');
select ok(pg_temp.due('%3304.jpg'), 'so has an Attachment removed 90 days ago or more');
select ok(pg_temp.due('00000000-0000-7000-8000-0000000033f2/%'), 'and a deleted household''s, at once');
select ok(not pg_temp.due('%3301.jpg'), 'never a live Entry''s');
select ok(not pg_temp.due('%3303.png'), 'nor one deleted yesterday');

set local role service_role;
select public.mark_attachments_purged(array['00000000-0000-7000-8000-000000003302'::uuid]);
select ok(not exists (select 1 from public.attachments_to_purge(100) where attachment_id = '00000000-0000-7000-8000-000000003302'),
	'a purged one isn''t due again');
reset role;

set local role authenticated;
select throws_ok($$ select * from public.attachments_to_purge(10) $$, '42501', null, 'a User can''t list what''s due');

select * from finish();
rollback;
