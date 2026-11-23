-- Daily exchange rates (spec §3.4, §5; #44). Open Exchange Rates' free plan quotes everything against USD, so each
-- date's rates are kept as they come, per USD; a device converts between any two currencies from those (the cross rate,
-- packages/domain). Each date is fetched once: today's after 01:00 UTC, a past one when a device asks for it.
-- Reference data, not tenant-owned: every signed-in User may read every rate, and only the service role writes them.
create table public.exchange_rates (
	id uuid primary key default gen_random_uuid(),
	on_date date not null,
	currency text not null check (currency ~ '^[A-Z]{3}$'),
	per_usd numeric not null check (per_usd > 0),
	created_at timestamptz not null default now(),
	unique (on_date, currency)
);
alter table public.exchange_rates enable row level security;
create policy "Signed-in Users read every rate" on public.exchange_rates
	for select to authenticated using (true);
grant select on public.exchange_rates to authenticated;

-- Past dates devices asked for (pending until fulfilled, kept a while after for each User's daily allowance); and
-- every fetch tried, which the monthly quota counts.
create table private.exchange_rate_requests (
	on_date date primary key,
	requested_by uuid not null references auth.users (id) on delete cascade,
	requested_at timestamptz not null default now(),
	fulfilled_at timestamptz
);
create index on private.exchange_rate_requests (requested_by, requested_at);
create table private.exchange_rate_fetches (
	id bigint generated always as identity primary key,
	on_date date not null,
	attempted_at timestamptz not null default now()
);
create index on private.exchange_rate_fetches (attempted_at);

-- A device asks for the rates of past dates it needs (a backdated Entry). Dates already held, in the future or before
-- OXR's history (1999) are ignored; a User may ask for at most 31 dates a day, so nobody can spend the quota alone.
-- Returns how many were newly asked for.
create function public.request_exchange_rates(dates date[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	asker uuid := (select auth.uid());
	allowance integer;
	added integer;
begin
	if asker is null then
		raise exception 'Only a signed-in User asks for rates' using errcode = '42501';
	end if;
	allowance := 31 - (
		select count(*) from private.exchange_rate_requests
		where requested_by = asker and requested_at > now() - interval '1 day'
	);
	insert into private.exchange_rate_requests (on_date, requested_by)
	select d, asker
	from (select distinct unnest(dates) as d) wanted
	where d >= date '1999-01-01'
		and d < (now() at time zone 'utc')::date
		and not exists (select 1 from public.exchange_rates r where r.on_date = d)
	order by d desc
	limit greatest(allowance, 0)
	-- A date fulfilled once but no longer held (it never is, short of a hand edit) may be asked for again.
	on conflict (on_date) do update
		set requested_by = excluded.requested_by, requested_at = now(), fulfilled_at = null
		where private.exchange_rate_requests.fulfilled_at is not null;
	get diagnostics added = row_count;
	return added;
end;
$$;
revoke all on function public.request_exchange_rates(date[]) from public, anon;
grant execute on function public.request_exchange_rates(date[]) to authenticated;

-- What the fetcher needs to decide (packages/domain `pickRateDates`): whether today is held, the dates asked for with
-- their last try, and how many fetches this month has used.
create function public.exchange_rate_facts() returns jsonb
language sql stable security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'todayHeld', exists (
			select 1 from public.exchange_rates where on_date = (now() at time zone 'utc')::date
		),
		'requested', coalesce((
			select jsonb_agg(jsonb_build_object(
				'date', q.on_date,
				'lastAttemptAt', (select max(f.attempted_at) from private.exchange_rate_fetches f where f.on_date = q.on_date)
			) order by q.requested_at)
			from private.exchange_rate_requests q
			where q.fulfilled_at is null
		), '[]'::jsonb),
		'fetchesThisMonth', (
			select count(*) from private.exchange_rate_fetches
			where attempted_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
		),
		'todayLastAttemptAt', (
			select max(attempted_at) from private.exchange_rate_fetches
			where on_date = (now() at time zone 'utc')::date
		)
	);
$$;
revoke all on function public.exchange_rate_facts() from public, anon, authenticated;
grant execute on function public.exchange_rate_facts() to service_role;

-- Recorded before each fetch, so a failing one is retried only after a while and always counts against the quota.
create function public.record_exchange_rate_fetch(on_date date) returns void
language sql security definer
set search_path = ''
as $$
	insert into private.exchange_rate_fetches (on_date) values (record_exchange_rate_fetch.on_date);
$$;
revoke all on function public.record_exchange_rate_fetch(date) from public, anon, authenticated;
grant execute on function public.record_exchange_rate_fetch(date) to service_role;

-- One date's rates, per USD as text so nothing passes through a float; a request for the date is fulfilled.
create function public.store_exchange_rates(on_date date, rates jsonb) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	added integer;
begin
	insert into public.exchange_rates (on_date, currency, per_usd)
	select store_exchange_rates.on_date, r.key, r.value::numeric
	from jsonb_each_text(rates) r
	on conflict do nothing;
	get diagnostics added = row_count;
	update private.exchange_rate_requests q set fulfilled_at = now()
	where q.on_date = store_exchange_rates.on_date and q.fulfilled_at is null;
	return added;
end;
$$;
revoke all on function public.store_exchange_rates(date, jsonb) from public, anon, authenticated;
grant execute on function public.store_exchange_rates(date, jsonb) to service_role;

-- Calls `fetch-exchange-rates` when there may be something to fetch, and the project's URL and service key are in
-- Vault (as `request_dispatch` does). The function itself applies the quota and the wait between tries.
create function private.request_exchange_rates() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
	service_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
	today date := (now() at time zone 'utc')::date;
begin
	if project_url is null or service_key is null then
		return;
	end if;
	if not (
		(
			extract(hour from now() at time zone 'utc') >= 1
			and not exists (select 1 from public.exchange_rates where on_date = today)
			and not exists (
				select 1 from private.exchange_rate_fetches
				where on_date = today and attempted_at > now() - interval '1 hour'
			)
		)
		or exists (
			select 1 from private.exchange_rate_requests q
			where q.fulfilled_at is null and not exists (
				select 1 from private.exchange_rate_fetches f
				where f.on_date = q.on_date and f.attempted_at > now() - interval '1 hour'
			)
		)
	) then
		return;
	end if;
	perform net.http_post(
		url := project_url || '/functions/v1/fetch-exchange-rates',
		headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
		body := '{}'::jsonb,
		timeout_milliseconds := 60000
	);
end;
$$;
revoke all on function private.request_exchange_rates() from public;

-- Every minute, so a backdated Entry's rate arrives soon; most minutes it finds nothing to do and calls nothing.
select cron.schedule('fetch-exchange-rates', '* * * * *', 'select private.request_exchange_rates()');
-- The quota counts this month's fetches and the allowance today's asks; older rows go after a few months.
select cron.schedule(
	'purge-exchange-rate-fetches', '23 4 1 * *',
	$$
	delete from private.exchange_rate_fetches where attempted_at < now() - interval '90 days';
	delete from private.exchange_rate_requests where fulfilled_at < now() - interval '90 days';
	$$
);
