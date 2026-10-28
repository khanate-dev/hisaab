-- Account deletion (spec §3.1; issue #12's resolution; ADR-0001's amendment; #64): immediate and server-side, in one
-- transaction. Blocked while the User is the sole Admin of a shared household with others in it. Their Personal
-- household, and any shared one with nobody else, is hard-deleted. In every other household they had rows in, they
-- become an anonymous Former member ("Former member 1", "2", …): their Entries, Attachments, Recurring rules (still
-- running), Invites and Activity log stay, attributed to it; their pending Invites are revoked. Their own data goes
-- with the Auth user (memberships, profile, Saved filters, Notifications and preferences, devices, sessions), and a
-- deletion ledger keeps only the opaque id and when, to re-apply after a disaster-recovery restore.
-- Expand-only: new tables and functions; three foreign keys to auth.users relaxed, as a Former member's rows point at
-- it rather than at a User; guards that let the anonymizing transaction (and only it) re-attribute rows.

-- The anonymous stand-in for a deleted User in one household. Its id is what their rows carry from then on; who it
-- stood in for is never kept.
create table public.former_members (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- "Former member 1", "Former member 2", in the order they went.
	number integer not null check (number >= 1),
	created_at timestamptz not null default now(),
	unique (household_id, number)
);
create index former_members_household_id_idx on public.former_members (household_id);
alter table public.former_members enable row level security;
create policy "Members see their households' Former members" on public.former_members
	for select to authenticated using (private.is_member(household_id));
revoke all on public.former_members from anon, authenticated;
grant select on public.former_members to authenticated;

-- Only the opaque id and when (issue #12): re-applied after any restore of a nightly dump.
create table private.deletion_ledger (
	user_id uuid primary key,
	deleted_at timestamptz not null default now()
);
revoke all on private.deletion_ledger from public, anon, authenticated;

-- A Former member's rows point at it, not at a User.
alter table public.entries drop constraint entries_created_by_fkey;
alter table public.recurring_rules drop constraint recurring_rules_created_by_fkey;
alter table public.attachments drop constraint attachments_created_by_fkey;

-- Whether this transaction is the one re-attributing a deleted User's rows (`delete_account` sets it, locally).
create function private.anonymizing() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(current_setting('hisaab.anonymizing', true), '') = 'on' $$;
revoke all on function private.anonymizing() from public;
-- Read by the guards, which run as whoever writes.
grant execute on function private.anonymizing() to authenticated, service_role;

create or replace function private.keep_entry_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if private.anonymizing() then
		return new;
	end if;
	if (new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at)
		and new.id is not distinct from old.id and new.household_id is not distinct from old.household_id
		and exists (select 1 from public.occurrences where entry_id = old.id and household_id = old.household_id) then
		new.created_by := old.created_by;
		new.created_at := old.created_at;
	end if;
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;

create or replace function private.keep_recurring_rule_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if private.anonymizing() then
		return new;
	end if;
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.kind is distinct from old.kind or new.created_by is distinct from old.created_by
		or new.created_at is distinct from old.created_at then
		raise exception 'id, household_id, kind, created_by and created_at cannot change' using errcode = '42501';
	end if;
	return new;
end;
$$;

create or replace function private.keep_attachment_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if private.anonymizing() then
		return new;
	end if;
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

create or replace function private.keep_invite_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if private.anonymizing() then
		return new;
	end if;
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.token is distinct from old.token or new.role is distinct from old.role
		or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
		or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
		or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
		raise exception 'An Invite only gets revoked, once' using errcode = '42501';
	end if;
	-- Only redeem_invite, which flags its own transaction.
	if (new.accepted_by is distinct from old.accepted_by or new.accepted_at is distinct from old.accepted_at)
		and coalesce(current_setting('hisaab.redeeming', true), '') <> 'on' then
		raise exception 'Only accepting an Invite marks it accepted' using errcode = '42501';
	end if;
	return new;
end;
$$;

create or replace function private.keep_household_server_columns() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	-- Its founder can be a Former member now; nothing else moves.
	if private.anonymizing() and new.id is not distinct from old.id
		and new.personal_user_id is not distinct from old.personal_user_id
		and new.created_at is not distinct from old.created_at and new.restored_at is not distinct from old.restored_at then
		return new;
	end if;
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

-- What others' inboxes say about a deleted User loses their name in the same transaction.
create or replace function private.keep_notification_as_raised() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if private.anonymizing() then
		return new;
	end if;
	if (select auth.uid()) is not null and (row(new.id, new.household_id, new.user_id, new.trigger, new.subject_user_id,
		new.payload, new.created_at, new.dedupe_key) is distinct from row(old.id, old.household_id, old.user_id,
		old.trigger, old.subject_user_id, old.payload, old.created_at, old.dedupe_key)) then
		raise exception 'Only whether a Notification is read changes' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- Re-attributing rows to a Former member isn't a change anyone made: nothing to log.
create or replace function private.log_activity() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	changed jsonb := to_jsonb(coalesce(new, old));
	household uuid := case when tg_table_name = 'households' then (changed ->> 'id')::uuid
		else (changed ->> 'household_id')::uuid end;
	device_time timestamptz;
begin
	if private.anonymizing() and tg_op = 'UPDATE' then
		return null;
	end if;
	-- A household being deleted takes its log with it; nothing to record about its rows going.
	if not exists (select 1 from public.households where id = household) then
		return null;
	end if;
	-- A whole-row update that changed nothing isn't a change.
	if tg_op = 'UPDATE' then
		if to_jsonb(new) = to_jsonb(old) then
			return null;
		end if;
	end if;
	begin
		device_time := (current_setting('request.headers', true)::jsonb ->> 'x-device-time')::timestamptz;
	exception when others then
		device_time := null;
	end;
	insert into public.activity_log (household_id, table_name, row_id, action, actor_id, device_time, before, after)
	values (
		household,
		tg_table_name,
		(changed ->> 'id')::uuid,
		lower(tg_op),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid,
		device_time,
		case when tg_op = 'INSERT' then null else private.as_logged(to_jsonb(old)) end,
		case when tg_op = 'DELETE' then null else private.as_logged(to_jsonb(new)) end
	);
	return null;
end;
$$;

-- Append-only still, but for the anonymizing transaction moving who made a change to their Former member.
create or replace function private.keep_activity_log() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'DELETE' and not exists (select 1 from public.households where id = old.household_id) then
		return old;
	end if;
	if tg_op = 'UPDATE' and private.anonymizing()
		and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
		return new;
	end if;
	raise exception 'The Activity log is append-only' using errcode = '42501';
end;
$$;

-- The shared households that block deleting an account: ones where the User is the only Admin and others are in it.
-- The UI offers two fixes for each: promote another Admin, or delete the household. The service role's only.
create function public.account_deletion_blockers(target_user uuid)
returns table (household_id uuid, name text)
language sql stable security definer
set search_path = ''
as $$
	select h.id, h.name
	from public.memberships m
	join public.households h on h.id = m.household_id
	where m.user_id = target_user and m.role = 'admin' and h.personal_user_id is null
		and not exists (select 1 from public.memberships o
			where o.household_id = h.id and o.user_id <> target_user and o.role = 'admin')
		and exists (select 1 from public.memberships o where o.household_id = h.id and o.user_id <> target_user)
	order by h.name;
$$;
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- Deletes an account, all in this one transaction (issue #12). Answers `blocked` with the households in the way, or
-- `deleted` with the households hard-deleted (whose files the caller purges at once). The service role's only; the
-- `delete-account` Edge Function checks the fresh OTP and the typed confirmation first.
create function public.delete_account(target_user uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	blocked jsonb;
	gone uuid[];
	household uuid;
	former uuid;
begin
	select coalesce(jsonb_agg(jsonb_build_object('householdId', b.household_id, 'name', b.name)), '[]'::jsonb)
	into blocked from public.account_deletion_blockers(target_user) b;
	if jsonb_array_length(blocked) > 0 then
		return jsonb_build_object('status', 'blocked', 'households', blocked);
	end if;
	perform set_config('hisaab.anonymizing', 'on', true);

	-- Their Personal household, and shared ones with nobody else in them: hard-deleted, as deleting a household is.
	with deleted as (
		delete from public.households h
		where h.personal_user_id = target_user
			or (h.personal_user_id is null
				and exists (select 1 from public.memberships m where m.household_id = h.id and m.user_id = target_user)
				and not exists (select 1 from public.memberships o where o.household_id = h.id and o.user_id <> target_user))
		returning h.id
	)
	select coalesce(array_agg(id), '{}') into gone from deleted;

	-- Pending Invites they made are revoked.
	update public.invites set revoked_at = now()
	where created_by = target_user and accepted_at is null and revoked_at is null;

	-- Every other household with anything of theirs gets a Former member, which their rows then point at; a household
	-- they'd left before keeps their Entries too, so it counts.
	for household in
		select m.household_id from public.memberships m where m.user_id = target_user
		union select e.household_id from public.entries e where e.created_by = target_user
		union select r.household_id from public.recurring_rules r where r.created_by = target_user
		union select a.household_id from public.attachments a where a.created_by = target_user
		union select l.household_id from public.activity_log l where l.actor_id = target_user
		union select i.household_id from public.invites i where i.created_by = target_user or i.accepted_by = target_user
		union select h.id from public.households h where h.created_by = target_user
	loop
		former := private.uuid_v7();
		insert into public.former_members (id, household_id, number)
		values (former, household,
			coalesce((select max(f.number) from public.former_members f where f.household_id = household), 0) + 1);
		update public.entries set created_by = former where household_id = household and created_by = target_user;
		update public.recurring_rules set created_by = former where household_id = household and created_by = target_user;
		update public.attachments set created_by = former where household_id = household and created_by = target_user;
		update public.activity_log set actor_id = former where household_id = household and actor_id = target_user;
		update public.invites set created_by = former where household_id = household and created_by = target_user;
		update public.invites set accepted_by = former where household_id = household and accepted_by = target_user;
		update public.households set created_by = former where id = household and created_by = target_user;
	end loop;

	-- Leaving each household (which also unlinks their cross-household transfers, ADR-0003, and tells its Admins);
	-- what the others' inboxes say about them keeps no name.
	delete from public.memberships where user_id = target_user;
	update public.notifications
	set payload = (payload::jsonb || '{"name": null}'::jsonb)::text, subject_user_id = null
	where payload::jsonb ->> 'userId' = target_user::text or subject_user_id = target_user;

	insert into private.deletion_ledger (user_id) values (target_user) on conflict (user_id) do nothing;
	-- The Auth user goes, and with it their profile, Saved filters, Notifications and preferences, push devices and
	-- sessions (signed-in devices wipe their local data on next contact). The email can sign up afresh.
	delete from auth.users where id = target_user;
	return jsonb_build_object('status', 'deleted', 'households', to_jsonb(gone));
end;
$$;
revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- A Former member's Recurring rules keep running (issue #12): Auto-record records them in its name.
create or replace function private.auto_record() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	recorded integer := 0;
	inserted integer;
	rule record;
	due record;
begin
	for rule in
		select r.*, (now() at time zone h.timezone)::date as today
		from public.recurring_rules r
		join public.households h on h.id = r.household_id
		join public.categories c on c.id = r.category_id and c.household_id = r.household_id
		join public.wallets w on w.id = r.wallet_id and w.household_id = r.household_id
		where r.mode = 'auto' and r.amount is not null
			-- No timezone yet: each device records in its own today instead (`entryTimeZone`).
			and h.timezone is not null
			-- Never anything the database would refuse every hour: an archived Category or Wallet.
			and c.archived_at is null and w.archived_at is null
			-- Recorded in its maker's name, so only while they may still write there, or once they're its Former member.
			and (exists (select 1 from public.memberships m
					where m.household_id = r.household_id and m.user_id = r.created_by and m.role in ('admin', 'member'))
				or exists (select 1 from public.former_members f
					where f.household_id = r.household_id and f.id = r.created_by))
	loop
		-- From the day the rule was made (the UTC date, as the devices read `created_at`), at most 62 days back.
		for due in
			select d.due_on, ids.occurrence_id, ids.entry_id
			from private.schedule_dates(rule.frequency, rule.interval, rule.day_of_month, rule.starts_on, rule.ends_on,
				greatest(rule.starts_on, (rule.created_at at time zone 'UTC')::date, rule.today - 62), rule.today)
				as d(due_on),
				lateral private.occurrence_ids(rule.id, d.due_on) as ids
			where not exists (select 1 from public.occurrences o where o.id = ids.occurrence_id)
		loop
			begin
				insert into public.occurrences (id, household_id, rule_id, due_on, state, entry_id)
				values (due.occurrence_id, rule.household_id, rule.id, due.due_on, 'confirmed', due.entry_id)
				on conflict (id) do nothing;
				get diagnostics inserted = row_count;
				-- A device's own (a skip, a snooze, a confirm) landed meanwhile: it speaks for this one.
				continue when inserted = 0;
				insert into public.entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on,
					description, created_by)
				values (due.entry_id, rule.household_id, rule.wallet_id, rule.kind,
					case when rule.kind = 'expense' then -rule.amount else rule.amount end,
					rule.category_id, due.due_on, rule.description, rule.created_by)
				on conflict (id) do nothing;
				recorded := recorded + 1;
			exception when others then
				-- One refused for another reason is left Pending; the rest still go.
				raise warning 'Auto-record left % of rule % Pending: %', due.due_on, rule.id, sqlerrm;
			end;
		end loop;
	end loop;
	return recorded;
end;
$$;
revoke all on function private.auto_record() from public;
