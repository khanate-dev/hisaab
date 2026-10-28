-- Notifications (spec §3.5, issue #9): triggers raise Notifications into an outbox; the `drain-notifications` Edge
-- Function, called every minute by pg_cron, fans each out to its recipients (`drainNotifications` in the domain
-- package). The Notification inbox always receives every Notification a User gets: a delivery row each. Preferences
-- are per User × household × trigger, over defaults by Role. The Membership trigger ships first. Inbox rows go after 90
-- days. Expand-only: new tables, functions, triggers and jobs.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The outbox: never read by clients, so it lives outside the API's schema.
create table private.notifications (
	id uuid primary key default private.uuid_v7(),
	household_id uuid not null references public.households (id) on delete cascade,
	trigger text not null check (trigger in ('recurring_due', 'auto_recorded', 'budget_threshold', 'loan_due',
		'household_activity', 'membership', 'monthly_summary')),
	-- Whom it's about, when it's about someone (`subjectUserId`).
	subject_user_id uuid,
	-- JSON text the inbox reads; never an amount, as push text must not carry one.
	payload text not null check (jsonb_typeof(payload::jsonb) = 'object'),
	created_at timestamptz not null default now(),
	drained_at timestamptz
);
create index notifications_pending_idx on private.notifications (created_at) where drained_at is null;

-- One Notification reaching one User through one channel; the inbox is channel `inbox`. It carries what the inbox
-- shows, so it reads alone, even for a household the User has since left.
create table public.notification_deliveries (
	id uuid primary key default private.uuid_v7(),
	notification_id uuid not null references private.notifications (id) on delete cascade,
	household_id uuid not null references public.households (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	channel text not null default 'inbox' check (channel in ('inbox')),
	trigger text not null,
	payload text not null,
	created_at timestamptz not null default now(),
	read_at timestamptz,
	-- A drain that runs twice delivers once.
	unique (notification_id, user_id, channel)
);
create index notification_deliveries_user_id_idx on public.notification_deliveries (user_id, created_at desc);
create index notification_deliveries_household_id_idx on public.notification_deliveries (household_id);
alter table public.notification_deliveries enable row level security;
create policy "Users read their own Notifications" on public.notification_deliveries
	for select to authenticated using (user_id = (select auth.uid()));
create policy "Users mark their own Notifications read" on public.notification_deliveries
	for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users dismiss their own Notifications" on public.notification_deliveries
	for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notification_deliveries from anon, authenticated;
grant select, update, delete on public.notification_deliveries to authenticated;

-- A User only marks a Notification read (or unread); what it says stays as delivered.
create function private.keep_delivery_as_sent() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if (select auth.uid()) is not null and (row(new.id, new.notification_id, new.household_id, new.user_id, new.channel,
		new.trigger, new.payload, new.created_at) is distinct from row(old.id, old.notification_id, old.household_id,
		old.user_id, old.channel, old.trigger, old.payload, old.created_at)) then
		raise exception 'Only whether a Notification is read changes' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_delivery_as_sent() from public;
create trigger keep_delivery_as_sent before update on public.notification_deliveries
	for each row execute function private.keep_delivery_as_sent();

-- A User's own choice for a trigger in a household. Not unique: two devices choosing offline both sync, and the one
-- written last wins (`isOn`).
create table public.notification_preferences (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	trigger text not null check (trigger in ('recurring_due', 'auto_recorded', 'budget_threshold', 'loan_due',
		'household_activity', 'membership', 'monthly_summary')),
	enabled boolean not null,
	created_at timestamptz not null default now()
);
create index notification_preferences_household_id_idx on public.notification_preferences (household_id);
create index notification_preferences_user_id_idx on public.notification_preferences (user_id);
alter table public.notification_preferences enable row level security;
create policy "Users read their own notification preferences" on public.notification_preferences
	for select to authenticated using (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users set their own notification preferences" on public.notification_preferences
	for insert to authenticated with check (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users change their own notification preferences" on public.notification_preferences
	for update to authenticated
	using (user_id = (select auth.uid()) and private.is_member(household_id))
	with check (user_id = (select auth.uid()) and private.is_member(household_id));
create policy "Users clear their own notification preferences" on public.notification_preferences
	for delete to authenticated using (user_id = (select auth.uid()) and private.is_member(household_id));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

create function private.keep_preference_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.user_id is distinct from old.user_id or new.trigger is distinct from old.trigger then
		raise exception 'A preference stays its User''s, for its household and trigger' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_preference_origin() from public;
create trigger keep_preference_origin before update on public.notification_preferences
	for each row execute function private.keep_preference_origin();

-- The Membership trigger (issue #9): someone joined, left, was removed or changed Role in a shared household. A
-- founder becoming the first Admin, a household being deleted and an account being deleted raise nothing.
create function private.notify_membership() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	changed public.memberships;
	change text;
	household_name text;
	person text;
begin
	-- NEW is read only when there is one.
	if tg_op = 'DELETE' then
		changed := old;
	else
		changed := new;
	end if;
	select name into household_name from public.households where id = changed.household_id and personal_user_id is null;
	if not found then
		return null;
	end if;
	if tg_op = 'INSERT' then
		if not exists (select 1 from public.memberships where household_id = new.household_id and id <> new.id) then
			return null;
		end if;
		change := 'joined';
	elsif tg_op = 'DELETE' then
		if not exists (select 1 from auth.users where id = old.user_id) then
			return null;
		end if;
		change := case when (select auth.uid()) = old.user_id then 'left' else 'removed' end;
	else
		if new.role is not distinct from old.role then
			return null;
		end if;
		change := 'role_changed';
	end if;
	select display_name into person from public.profiles where id = changed.user_id;
	insert into private.notifications (household_id, trigger, subject_user_id, payload)
	values (changed.household_id, 'membership', changed.user_id, jsonb_build_object(
		'change', change,
		'userId', changed.user_id,
		'name', person,
		'role', changed.role,
		'householdName', household_name
	)::text);
	return null;
end;
$$;
revoke all on function private.notify_membership() from public;
create trigger notify_membership after insert or delete or update of role on public.memberships
	for each row execute function private.notify_membership();

-- What the drain reads and writes, as the service role only (the outbox isn't in the API's schema).
create function public.pending_notifications(batch integer) returns table (
	id uuid, household_id uuid, trigger text, subject_user_id uuid, payload text
)
language sql stable security definer
set search_path = ''
as $$
	select id, household_id, trigger, subject_user_id, payload from private.notifications
	where drained_at is null order by created_at, id limit batch;
$$;
revoke all on function public.pending_notifications(integer) from public, anon, authenticated;
grant execute on function public.pending_notifications(integer) to service_role;

-- Writes a drain's deliveries and marks its Notifications drained, in one transaction.
create function public.deliver_notifications(deliveries jsonb, drained uuid[]) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
	insert into public.notification_deliveries (notification_id, household_id, user_id, channel, trigger, payload)
	select d.notification_id, d.household_id, d.user_id, d.channel, d.trigger, d.payload
	from jsonb_to_recordset(deliveries) as d(notification_id uuid, household_id uuid, user_id uuid, channel text,
		trigger text, payload text)
	-- A recipient whose account has since gone gets nothing.
	where exists (select 1 from auth.users where id = d.user_id)
	on conflict (notification_id, user_id, channel) do nothing;
	update private.notifications set drained_at = now() where id = any (drained);
end;
$$;
revoke all on function public.deliver_notifications(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.deliver_notifications(jsonb, uuid[]) to service_role;

-- Calls the drain Edge Function, when there's anything to drain and the project's URL and service key are in Vault
-- (`project_url`, `service_role_key`, which the prod setup in #30 adds). Without them (say, locally) it does nothing.
create function private.request_drain() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
	service_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
	if project_url is null or service_key is null
		or not exists (select 1 from private.notifications where drained_at is null) then
		return;
	end if;
	perform net.http_post(
		url := project_url || '/functions/v1/drain-notifications',
		headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
		body := '{}'::jsonb
	);
end;
$$;
revoke all on function private.request_drain() from public;

-- The inbox keeps 90 days; drained Notifications go with their deliveries.
create function private.purge_notifications() returns void
language sql security definer
set search_path = ''
as $$
	delete from public.notification_deliveries where created_at < now() - interval '90 days';
	delete from private.notifications where drained_at is not null and created_at < now() - interval '90 days';
$$;
revoke all on function private.purge_notifications() from public;

select cron.schedule('drain-notifications', '* * * * *', 'select private.request_drain()');
select cron.schedule('purge-notifications', '17 3 * * *', 'select private.purge_notifications()');
