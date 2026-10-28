-- Push delivery (spec §3.5; issue #13; #61): each device that has push on registers a row, holding its Expo token or
-- its Web Push subscription. A Notification raised for a User becomes a delivery to each of their devices, when that
-- trigger is on for them (their preference, else their Role's default, as `isOn` has it); the inbox gets it either way.
-- `dispatch-notifications` sends them; a target that's gone (an expired token, a 404/410 subscription) is forgotten.
-- Expand-only: a new table, functions and a trigger.

-- Whether text is a Web Push subscription at a known push service (Chrome's, Firefox's, Edge's, Safari's), over https.
create function private.is_push_subscription(subscription text) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
	endpoint text;
begin
	endpoint := subscription::jsonb ->> 'endpoint';
	return endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/';
exception when others then
	return false;
end;
$$;
revoke all on function private.is_push_subscription(text) from public;
grant execute on function private.is_push_subscription(text) to authenticated, service_role;

create table public.devices (
	-- Minted by the device once, kept on it (`deviceId`), so re-registering changes its row rather than adding one.
	id uuid primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	platform text not null check (platform in ('ios', 'android', 'web')),
	push_kind text not null check (push_kind in ('expo', 'webpush')),
	-- The Expo push token, or the Web Push subscription as JSON; one device holds it at a time.
	push_token text not null unique check (char_length(push_token) between 1 and 4000),
	last_seen_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	check ((platform = 'web') = (push_kind = 'webpush')),
	-- Only real push targets, so the dispatcher never posts anywhere else: an Expo token, or a Web Push subscription at
	-- a known push service over https.
	check (
		(push_kind = 'expo' and push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$')
		or (push_kind = 'webpush' and private.is_push_subscription(push_token))
	)
);
create index devices_user_id_idx on public.devices (user_id);
alter table public.devices enable row level security;
create policy "Users see their own devices" on public.devices
	for select to authenticated using (user_id = (select auth.uid()));
create policy "Users forget their own devices" on public.devices
	for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.devices from anon, authenticated;
grant select, delete on public.devices to authenticated;

-- Registers this device for the signed-in User. A device, or a token, last left by someone else (a sign-out that
-- couldn't reach the server) is taken over, so nobody's pushes keep landing on someone else's lock screen.
create function public.register_device(device_id uuid, device_platform text, kind text, token text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		raise exception 'Sign in to register a device' using errcode = '42501';
	end if;
	delete from public.devices where (id = device_id or push_token = token) and user_id <> (select auth.uid());
	insert into public.devices (id, user_id, platform, push_kind, push_token)
	values (device_id, (select auth.uid()), device_platform, kind, token)
	on conflict (id) do update set platform = excluded.platform, push_kind = excluded.push_kind,
		push_token = excluded.push_token, last_seen_at = now();
end;
$$;
revoke all on function public.register_device(uuid, text, text, text) from public, anon;
grant execute on function public.register_device(uuid, text, text, text) to authenticated;

-- A device forgotten (signed out, push turned off, or its target gone) takes its unsent pushes with it.
create function private.drop_device_deliveries() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	update public.notification_deliveries set status = 'dead', last_error = 'Device forgotten'
	where target = old.push_token and status in ('pending', 'failed');
	return null;
end;
$$;
revoke all on function private.drop_device_deliveries() from public;
create trigger drop_device_deliveries after delete or update of push_token on public.devices
	for each row execute function private.drop_device_deliveries();

-- Expo's tickets say a message was accepted; its receipts, fetched on a later run, say whether it reached the device
-- (#13). A delivery keeps its ticket until its receipt is in.
alter table public.notification_deliveries add column ticket_id text, add column receipt_checked_at timestamptz;

-- Sent Expo deliveries whose receipt should be in (15 minutes on) and still kept (Expo keeps them a day), at most
-- `batch`; the service role's only.
create function public.expo_receipts_due(batch integer) returns table (id uuid, target text, ticket_id text)
language sql stable security definer
set search_path = ''
as $$
	select d.id, d.target, d.ticket_id from public.notification_deliveries d
	where d.channel = 'expo' and d.status = 'sent' and d.ticket_id is not null and d.receipt_checked_at is null
		and d.sent_at < now() - interval '15 minutes' and d.sent_at > now() - interval '1 day'
	order by d.sent_at limit batch;
$$;
revoke all on function public.expo_receipts_due(integer) from public, anon, authenticated;
grant execute on function public.expo_receipts_due(integer) to service_role;

-- Records what each receipt said: delivered, or failed (dead), its error kept.
create function public.settle_receipts(results jsonb) returns void
language sql security definer
set search_path = ''
as $$
	update public.notification_deliveries d
	set receipt_checked_at = now(),
		status = case when r.error is null then d.status else 'dead' end,
		last_error = coalesce(r.error, d.last_error)
	from jsonb_to_recordset(results) as r(id uuid, error text)
	where d.id = r.id;
$$;
revoke all on function public.settle_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.settle_receipts(jsonb) to service_role;

-- Settling also keeps a sent delivery's Expo ticket.
create or replace function public.settle_deliveries(results jsonb) returns void
language sql security definer
set search_path = ''
as $$
	update public.notification_deliveries d
	set status = r.status, last_error = r.error, sent_at = case when r.status = 'sent' then now() end,
		ticket_id = r.ticket
	from jsonb_to_recordset(results) as r(id uuid, status text, error text, ticket text)
	where d.id = r.id and r.status in ('sent', 'failed', 'dead');
$$;

-- Whether a trigger reaches a User by push in a household: their own choice, else their Role's default (issue #9:
-- Viewers get only the Monthly summary; the Household activity digest is opt-in). Someone no longer in it (who just
-- left or was removed) hears only about that. As `isOn` in the domain package.
create function private.push_on(target_user uuid, target_household uuid, notification_trigger text) returns boolean
language sql stable security definer
set search_path = ''
as $$
	with member as (
		select m.role from public.memberships m where m.user_id = target_user and m.household_id = target_household
	)
	select case
		when not exists (select 1 from member) then notification_trigger = 'membership'
		else coalesce(
			(select p.enabled from public.notification_preferences p
			 where p.user_id = target_user and p.household_id = target_household and p.trigger = notification_trigger),
			case
				when notification_trigger = 'household_activity' then false
				when (select role from member) = 'viewer' then notification_trigger = 'monthly_summary'
				else true
			end
		)
	end;
$$;
revoke all on function private.push_on(uuid, uuid, text) from public;

-- Every Notification raised becomes a push delivery to each of its recipient's devices, where the trigger is on.
create function private.deliver_by_push() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
	if private.push_on(new.user_id, new.household_id, new.trigger) then
		insert into public.notification_deliveries (notification_id, user_id, channel, target)
		select new.id, new.user_id, d.push_kind, d.push_token
		from public.devices d where d.user_id = new.user_id
		on conflict (notification_id, channel, target) do nothing;
	end if;
	return null;
end;
$$;
revoke all on function private.deliver_by_push() from public;
create trigger deliver_by_push after insert on public.notifications
	for each row execute function private.deliver_by_push();

-- A target that's gone for good is forgotten, so nothing is sent to it again. The service role's only.
create function public.forget_push_targets(targets text[]) returns void
language sql security definer
set search_path = ''
as $$
	delete from public.devices where push_token = any (targets);
$$;
revoke all on function public.forget_push_targets(text[]) from public, anon, authenticated;
grant execute on function public.forget_push_targets(text[]) to service_role;
