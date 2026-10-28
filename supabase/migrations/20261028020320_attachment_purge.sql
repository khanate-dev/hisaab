-- Attachment purge (spec §3.4; issue #10 resolution 9; #56): the files of Entries deleted more than 90 days ago, and of
-- Attachments removed more than 90 days ago, are deleted from Storage; a deleted household's files go at once. The
-- `purge-attachments` Edge Function does it daily (pg_cron), through the Storage API with the service role. An
-- Attachment of a deleted Entry keeps its row, marked purged, so restoring the Entry shows it as expired.
-- Expand-only: a nullable column, functions and a job.

alter table public.attachments add column purged_at timestamptz;
create index attachments_not_purged_idx on public.attachments (entry_id) where purged_at is null;

-- Only the purge marks an Attachment purged; nobody clears or sets it by re-sending the row.
create or replace function private.keep_attachment_origin() returns trigger
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
	if coalesce(current_setting('hisaab.purging', true), '') <> 'on' then
		new.purged_at := old.purged_at;
	end if;
	return new;
end;
$$;

-- An Attachment's file in Storage (`attachmentPath` in the domain package).
create function private.attachment_object(household_id uuid, id uuid, media_type text) returns text
language sql immutable
set search_path = ''
as $$
	select household_id::text || '/' || id::text || '.' || case media_type
		when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
		when 'image/heic' then 'heic' else 'pdf' end;
$$;
revoke all on function private.attachment_object(uuid, uuid, text) from public;

-- An Attachment's id from its file's path (`<household>/<id>.<ext>`); null for anything else.
create function private.attachment_object_id(object_name text) returns uuid
language sql immutable
set search_path = ''
as $$
	select (substring(object_name from
		'^[0-9a-f-]{36}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z]+$'))::uuid;
$$;
revoke all on function private.attachment_object_id(text) from public;

-- What's due for purging, at most `batch` in all, the service role's only: a file and, for one whose row stays, its row.
create function public.attachments_to_purge(batch integer) returns table (path text, attachment_id uuid)
language sql stable security definer
set search_path = ''
as $$
	select path, attachment_id from (
		-- Attachments of Entries deleted 90 days ago or more (when the Activity log says; else when attached).
		select private.attachment_object(a.household_id, a.id, a.media_type) as path, a.id as attachment_id
		from public.attachments a
		where a.purged_at is null
			and not exists (select 1 from public.entries e where e.id = a.entry_id)
			and coalesce(
				(select max(l.synced_at) from public.activity_log l
				 where l.table_name = 'entries' and l.row_id = a.entry_id and l.action = 'delete'),
				a.created_at
			) < now() - interval '90 days'
		union all
		-- Files with no Attachment row: a removed Attachment's, 90 days after it was removed; a deleted household's, now.
		select o.name, null
		from storage.objects o
		left join public.households h on h.id = private.attachment_household(o.name)
		where o.bucket_id = 'attachments'
			and not exists (select 1 from public.attachments a where a.id = private.attachment_object_id(o.name))
			and (
				h.id is null
				or coalesce(
					(select max(l.synced_at) from public.activity_log l
					 where l.row_id = private.attachment_object_id(o.name) and l.table_name = 'attachments'
						and l.action = 'delete'),
					o.created_at
				) < now() - interval '90 days'
			)
	) as due
	limit batch;
$$;
revoke all on function public.attachments_to_purge(integer) from public, anon, authenticated;
grant execute on function public.attachments_to_purge(integer) to service_role;

create function public.mark_attachments_purged(ids uuid[]) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
	perform set_config('hisaab.purging', 'on', true);
	update public.attachments set purged_at = now() where id = any (ids) and purged_at is null;
	perform set_config('hisaab.purging', 'off', true);
end;
$$;
revoke all on function public.mark_attachments_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_attachments_purged(uuid[]) to service_role;

-- Calls the purge when the project's URL and service key are in Vault (as `request_dispatch` does).
create function private.request_attachment_purge() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
	service_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
	if project_url is null or service_key is null then
		return;
	end if;
	perform net.http_post(
		url := project_url || '/functions/v1/purge-attachments',
		headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
		body := '{}'::jsonb,
		timeout_milliseconds := 60000
	);
end;
$$;
revoke all on function private.request_attachment_purge() from public;

select cron.schedule('purge-attachments', '41 3 * * *', 'select private.request_attachment_purge()');
