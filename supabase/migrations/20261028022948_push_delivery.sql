-- Push delivery (spec §3.5; issue #13; #61): each device that has push on registers a row, holding its Expo token or
-- its Web Push subscription. A Notification raised for a User becomes a delivery to each of their devices, when that
-- trigger is on for them (their preference, else their Role's default, as `isOn` has it); the inbox gets it either way.
-- `dispatch-notifications` sends them; a target that's gone (an expired token, a 404/410 subscription) is forgotten.
-- Expand-only: a new table, functions and a trigger.

create table public.devices (
	-- Minted by the device once, kept on it (`deviceId`), so re-registering changes its row rather than adding one.
	id uuid primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	platform text not null check (platform in ('ios', 'android', 'web')),
	push_kind text not null check (push_kind in ('expo', 'webpush')),
	-- The Expo push token, or the Web Push subscription as JSON.
	push_token text not null check (char_length(push_token) between 1 and 4000),
	last_seen_at timestamptz not null default now(),
	created_at timestamptz not null default now()
);
create index devices_user_id_idx on public.devices (user_id);
alter table public.devices enable row level security;
create policy "Users see their own devices" on public.devices
	for select to authenticated using (user_id = (select auth.uid()));
create policy "Users register their own devices" on public.devices
	for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users refresh their own devices" on public.devices
	for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users forget their own devices" on public.devices
	for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.devices from anon, authenticated;
grant select, insert, update, delete on public.devices to authenticated;

-- Whether a trigger reaches a User by push in a household: their own choice, else their Role's default (issue #9:
-- Viewers get only the Monthly summary; the Household activity digest is opt-in). As `isOn` in the domain package.
create function private.push_on(target_user uuid, target_household uuid, notification_trigger text) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select coalesce(
		(select p.enabled from public.notification_preferences p
		 where p.user_id = target_user and p.household_id = target_household and p.trigger = notification_trigger),
		case
			when notification_trigger = 'household_activity' then false
			when (select m.role from public.memberships m
				  where m.user_id = target_user and m.household_id = target_household) = 'viewer'
				then notification_trigger = 'monthly_summary'
			else true
		end
	);
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
