-- Full backup (spec §3.4; #58): built and restored on an Admin's device, no server job. A restore makes a new household
-- holding the backup's own Categories, so it's marked as restored and isn't given the template's too.
-- Expand-only: a nullable column, and the template trigger skipping restored households.

-- When the household was made from a Full backup; null for one made from scratch.
alter table public.households add column restored_at timestamptz;

create or replace function private.give_household_categories() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if new.restored_at is null then
		perform private.copy_category_template(new.id);
	end if;
	return new;
end;
$$;

-- Whether it was restored is as set when it was made, like the other server-kept columns.
create or replace function private.keep_household_server_columns() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id
		or new.personal_user_id is distinct from old.personal_user_id
		or new.created_by is distinct from old.created_by
		or new.created_at is distinct from old.created_at
		or new.restored_at is distinct from old.restored_at then
		raise exception 'id, personal_user_id, created_by, created_at and restored_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;
