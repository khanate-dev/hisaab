-- Attachments (spec §3.4): up to 5 images or PDFs per Entry. The row (with a small thumbnail) syncs to every device
-- in the household; the file lives in the private `attachments` Storage bucket under the household's folder, and
-- downloads when it's opened. An Attachment outlives its Entry being deleted, so restoring the Entry brings its files
-- back. A removed Attachment's file stays too. Purging both after 90 days, and a deleted household's files at once,
-- comes later. Expand-only: a new table, a bucket and its policies.

create table public.attachments (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- Not a foreign key: the Entry may be deleted and later restored from the Activity log.
	entry_id uuid not null,
	media_type text not null
		check (media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
	-- About 10 MB at most (`MAX_ATTACHMENT_BYTES` in the domain package).
	size_bytes integer not null check (size_bytes between 1 and 10485760),
	-- The name it was picked with, for showing.
	file_name text check (char_length(file_name) <= 200),
	-- A small JPEG as a data URL, for images; it syncs with the row (`THUMBNAIL_LONG_EDGE`).
	thumbnail text check (char_length(thumbnail) <= 65536),
	created_by uuid not null references auth.users (id),
	created_at timestamptz not null default now()
);
create index attachments_household_id_idx on public.attachments (household_id);
create index attachments_entry_id_idx on public.attachments (entry_id);
alter table public.attachments enable row level security;
create policy "Members read their households' Attachments" on public.attachments
	for select to authenticated using (private.is_member(household_id));
create policy "Admins and Members attach files as themselves" on public.attachments
	for insert to authenticated with check (private.can_write(household_id) and created_by = (select auth.uid()));
-- Uploads send a PUT as an upsert, which needs UPDATE too; nothing about an Attachment changes but by re-sending it.
create policy "Admins and Members re-send Attachments" on public.attachments
	for update to authenticated using (private.can_write(household_id)) with check (private.can_write(household_id));
create policy "Admins and Members remove Attachments" on public.attachments
	for delete to authenticated using (private.can_write(household_id));
revoke all on public.attachments from anon, authenticated;
grant select, insert, update, delete on public.attachments to authenticated;

-- An Attachment is what it was when attached: a re-sent row can't change it.
create function private.keep_attachment_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.entry_id is distinct from old.entry_id or new.media_type is distinct from old.media_type
		or new.size_bytes is distinct from old.size_bytes or new.created_by is distinct from old.created_by then
		raise exception 'An Attachment stays as it was attached' using errcode = '42501';
	end if;
	new.created_at := old.created_at;
	return new;
end;
$$;
revoke all on function private.keep_attachment_origin() from public;
create trigger keep_attachment_origin before update on public.attachments
	for each row execute function private.keep_attachment_origin();

-- Five per Entry at most, and on one of the household's own Entries. The Entry row is held while counting, so two
-- uploads at once can't both pass with four already there.
create function private.keep_attachments_few() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	perform 1 from public.entries where id = new.entry_id and household_id = new.household_id for update;
	if not found then
		raise exception 'An Attachment belongs to one of the household''s Entries' using errcode = '23503';
	end if;
	-- `MAX_ATTACHMENTS` in the domain package.
	if (select count(*) from public.attachments where entry_id = new.entry_id and id <> new.id) >= 5 then
		raise exception 'An Entry has 5 Attachments at most' using errcode = '23514';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_attachments_few() from public;
create trigger keep_attachments_few before insert on public.attachments
	for each row execute function private.keep_attachments_few();

create trigger log_activity after insert or update or delete on public.attachments
	for each row execute function private.log_activity();

-- The files: private, about 10 MB each, images and PDFs only. Each lives at `<household_id>/<attachment id>.<ext>`
-- (`attachmentPath`), so the policies read the household from the first folder of its name.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
	array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- The household a file belongs to, from its path; null for a path that doesn't start with a household id.
create function private.attachment_household(object_name text) returns uuid
language sql stable
set search_path = ''
as $$
	select case when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		then (storage.foldername(object_name))[1]::uuid end;
$$;
revoke all on function private.attachment_household(text) from public;
grant execute on function private.attachment_household(text) to authenticated;

create policy "Members read their households' Attachment files" on storage.objects
	for select to authenticated
	using (bucket_id = 'attachments' and private.is_member(private.attachment_household(name)));
-- Only a file whose Attachment row is already here: none without one, and none for a row the server refused. Until
-- the row has uploaded the device's queue keeps retrying.
create policy "Admins and Members upload Attachment files" on storage.objects
	for insert to authenticated
	with check (
		bucket_id = 'attachments' and private.can_write(private.attachment_household(name))
		and exists (
			select 1 from public.attachments a
			where a.household_id = private.attachment_household(name)
				and name = a.household_id::text || '/' || a.id::text || '.' || split_part(name, '.', 2)
		)
	);
create policy "Admins and Members replace Attachment files" on storage.objects
	for update to authenticated
	using (bucket_id = 'attachments' and private.can_write(private.attachment_household(name)))
	with check (bucket_id = 'attachments' and private.can_write(private.attachment_household(name)));
create policy "Admins and Members remove Attachment files" on storage.objects
	for delete to authenticated
	using (bucket_id = 'attachments' and private.can_write(private.attachment_household(name)));
