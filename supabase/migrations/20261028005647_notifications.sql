-- Notifications (spec §3.5; issues #9 and #13). Producers raise a Notification as inbox rows, one per recipient, in
-- the same transaction as what caused it: the Notification inbox always receives everything, whatever the User's
-- preferences. Push and email go through an outbox, one `notification_deliveries` row per target (an Expo token, a
-- Web Push subscription, an email), which the `dispatch-notifications` Edge Function claims every minute (pg_cron).
-- Preferences choose which triggers also reach a User by push; targets and senders arrive with push (8.2), so no
-- delivery is produced yet. The Membership trigger ships first. Notifications go after 90 days, deliveries after 30.
-- Expand-only: new tables, functions, triggers and jobs.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The Notification inbox: one row per Notification per recipient, synced to that User.
create table public.notifications (
	id uuid primary key default private.uuid_v7(),
	household_id uuid not null references public.households (id) on delete cascade,
	-- The recipient.
	user_id uuid not null references auth.users (id) on delete cascade,
	trigger text not null check (trigger in ('recurring_due', 'auto_recorded', 'budget_threshold', 'loan_due',
		'household_activity', 'membership', 'monthly_summary')),
	-- Whom it's about, when it's about someone.
	subject_user_id uuid,
	-- JSON text the inbox reads (`readMembershipPayload`), carrying what it says (the household's name included), so it
	-- reads even after the User leaves. Never an amount: push text is made from it, and must not carry one.
	payload text not null check (jsonb_typeof(payload::jsonb) = 'object'),
	created_at timestamptz not null default now(),
	read_at timestamptz
);
create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index notifications_household_id_idx on public.notifications (household_id);
alter table public.notifications enable row level security;
create policy "Users read their own Notifications" on public.notifications
	for select to authenticated using (user_id = (select auth.uid()));
create policy "Users mark their own Notifications read" on public.notifications
	for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select, update on public.notifications to authenticated;

-- A User only marks a Notification read (or unread); what it says stays as raised.
create function private.keep_notification_as_raised() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if (select auth.uid()) is not null and (row(new.id, new.household_id, new.user_id, new.trigger, new.subject_user_id,
		new.payload, new.created_at) is distinct from row(old.id, old.household_id, old.user_id, old.trigger,
		old.subject_user_id, old.payload, old.created_at)) then
		raise exception 'Only whether a Notification is read changes' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_notification_as_raised() from public;
create trigger keep_notification_as_raised before update on public.notifications
	for each row execute function private.keep_notification_as_raised();

-- The push and email outbox: one row per Notification per target, sent by `dispatch-notifications`, retried with
-- backoff up to 5 attempts. Only the server reads it; a User may see their own.
create table public.notification_deliveries (
	id uuid primary key default private.uuid_v7(),
	notification_id uuid not null references public.notifications (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	-- A Delivery channel (CONTEXT.md): never the inbox, which isn't one.
	channel text not null check (channel in ('expo', 'webpush', 'email')),
	-- The Expo token, the Web Push subscription or the email address.
	target text not null,
	status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'dead')),
	attempts integer not null default 0 check (attempts >= 0),
	next_attempt_at timestamptz not null default now(),
	last_error text,
	created_at timestamptz not null default now(),
	sent_at timestamptz,
	unique (notification_id, channel, target)
);
create index notification_deliveries_due_idx on public.notification_deliveries (next_attempt_at)
	where status in ('pending', 'failed');
create index notification_deliveries_user_id_idx on public.notification_deliveries (user_id);
alter table public.notification_deliveries enable row level security;
create policy "Users see how their own Notifications were delivered" on public.notification_deliveries
	for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;

-- A User's choice for a trigger in a household: whether it also reaches them by push. One per User, household and
-- trigger, under an id derived from the three (`preferenceId`), so two devices choosing offline write the same row.
create table public.notification_preferences (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	trigger text not null check (trigger in ('recurring_due', 'auto_recorded', 'budget_threshold', 'loan_due',
		'household_activity', 'membership', 'monthly_summary')),
	-- Push.
	enabled boolean not null,
	-- Email, which only the Monthly summary has (#13: opt-in, off by default); null for every other trigger.
	email_enabled boolean check (email_enabled is null or trigger = 'monthly_summary'),
	created_at timestamptz not null default now(),
	unique (household_id, user_id, trigger)
);
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
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

-- A preference's id is the one every device derives (`preferenceId` in the domain package; uuid_generate_v5), and it
-- stays its User's, for its household and trigger; another device's copy keeps when it was first made.
create function private.keep_preference_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		format('preference/%s/%s/%s', new.user_id, new.household_id, new.trigger)) then
		raise exception 'A preference''s id comes from its User, household and trigger' using errcode = '23514';
	end if;
	if tg_op = 'UPDATE' then
		new.created_at := old.created_at;
	end if;
	return new;
end;
$$;
revoke all on function private.keep_preference_origin() from public;
create trigger keep_preference_origin before insert or update on public.notification_preferences
	for each row execute function private.keep_preference_origin();

-- The Membership trigger (issue #9): someone joined, left, was removed or changed Role in a shared household. It
-- reaches the household's Admins and the person it's about (even once they've left). A founder becoming the first
-- Admin, Personal households, a household being deleted and an account being deleted raise nothing.
create function private.notify_membership() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	changed public.memberships;
	change text;
	household_name text;
	payload text;
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
	payload := jsonb_build_object(
		'change', change,
		'userId', changed.user_id,
		'name', (select display_name from public.profiles where id = changed.user_id),
		'role', changed.role,
		'householdName', household_name
	)::text;
	insert into public.notifications (household_id, user_id, trigger, subject_user_id, payload)
	select changed.household_id, recipient, 'membership', changed.user_id, payload
	from (
		select user_id as recipient from public.memberships
		where household_id = changed.household_id and role = 'admin'
		union
		select changed.user_id
	) as recipients
	where exists (select 1 from auth.users where id = recipient);
	return null;
end;
$$;
revoke all on function private.notify_membership() from public;
create trigger notify_membership after insert or delete or update of role on public.memberships
	for each row execute function private.notify_membership();

-- What the dispatcher claims and settles, as the service role only. A claim locks due rows (skipping any another run
-- holds), counts the attempt and pushes the next one back, so overlapping runs never send a row twice.
create function public.claim_deliveries(batch integer) returns table (
	id uuid, notification_id uuid, user_id uuid, channel text, target text, attempts integer, trigger text, payload text
)
language sql security definer
set search_path = ''
as $$
	with due as (
		select d.id from public.notification_deliveries d
		-- A run that died after claiming leaves a row unsettled: it comes back, but never past its last attempt.
		where d.status in ('pending', 'failed') and d.next_attempt_at <= now() and d.attempts < 5
		order by d.next_attempt_at
		limit batch
		for update skip locked
	)
	update public.notification_deliveries d
	-- 1, 2, 4 then 8 minutes; capped at a day either way.
	set attempts = d.attempts + 1, next_attempt_at = now() + make_interval(mins => least(power(2, d.attempts), 1440)::int)
	from due, public.notifications n
	where d.id = due.id and n.id = d.notification_id
	returning d.id, d.notification_id, d.user_id, d.channel, d.target, d.attempts, n.trigger, n.payload;
$$;
revoke all on function public.claim_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_deliveries(integer) to service_role;

-- How each claimed delivery went: sent, failed (retried), or dead (an expired target, or out of attempts).
create function public.settle_deliveries(results jsonb) returns void
language sql security definer
set search_path = ''
as $$
	update public.notification_deliveries d
	set status = r.status, last_error = r.error, sent_at = case when r.status = 'sent' then now() end
	from jsonb_to_recordset(results) as r(id uuid, status text, error text)
	where d.id = r.id and r.status in ('sent', 'failed', 'dead');
$$;
revoke all on function public.settle_deliveries(jsonb) from public, anon, authenticated;
grant execute on function public.settle_deliveries(jsonb) to service_role;

-- Calls the dispatcher when a delivery is due and the project's URL and service key are in Vault (`project_url`,
-- `service_role_key`, which the prod setup in #30 adds). Without them, as locally, it does nothing.
create function private.request_dispatch() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
	service_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
	if project_url is null or service_key is null or not exists (
		select 1 from public.notification_deliveries
		where status in ('pending', 'failed') and next_attempt_at <= now() and attempts < 5
	) then
		return;
	end if;
	perform net.http_post(
		url := project_url || '/functions/v1/dispatch-notifications',
		headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
		body := '{}'::jsonb,
		timeout_milliseconds := 30000
	);
end;
$$;
revoke all on function private.request_dispatch() from public;

-- Housekeeping (#13): a delivery out of attempts and never settled is dead; Notifications go after 90 days,
-- deliveries after 30, and the jobs' own run log after 7.
create function private.purge_notifications() returns void
language sql security definer
set search_path = ''
as $$
	update public.notification_deliveries set status = 'dead', last_error = 'Out of attempts'
	where status in ('pending', 'failed') and attempts >= 5;
	delete from public.notification_deliveries where created_at < now() - interval '30 days';
	delete from public.notifications where created_at < now() - interval '90 days';
	delete from cron.job_run_details where end_time < now() - interval '7 days';
$$;
revoke all on function private.purge_notifications() from public;

select cron.schedule('dispatch-notifications', '* * * * *', 'select private.request_dispatch()');
select cron.schedule('purge-notifications', '17 3 * * *', 'select private.purge_notifications()');
