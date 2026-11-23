-- Base amounts (ADR-0005; spec §3.4; #45). An Entry in a Wallet whose currency isn't the household's Base currency
-- stores its value in the Base currency, frozen at its own date's market rate and editable. Expand-only: two nullable
-- columns that older builds never send.
--   base_amount: signed like amount, in the Base currency, rounded to its minor units; null for a Base-currency Entry,
--                or while no rate at all is held for one of the two currencies.
--   base_rate:   'market' (the date's own rates), 'estimated' (the nearest rates held, until the date's arrive) or
--                'edited' (the User's own figure, never recomputed); null for a Base-currency Entry.
-- The server is the authority: whatever a device sends, `fill_base_amount` sets the market figure when the date's rates
-- are held, and storing a date's rates corrects that date's estimated Entries. A device computes the same figure from
-- its cached rates (packages/domain `baseAmountOf`), so an Entry shows one offline; tests/sync checks they agree.
alter table public.entries
	add column base_amount numeric,
	add column base_rate text check (base_rate in ('market', 'estimated', 'edited'));

-- ISO 4217 minor units, as packages/domain's `currencyDecimals` has them.
create function private.currency_decimals(code text) returns integer
language sql immutable
set search_path = ''
as $$
	select case
		when code in ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV',
			'XAF', 'XOF', 'XPF') then 0
		when code in ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND') then 3
		else 2
	end;
$$;
revoke all on function private.currency_decimals(text) from public;

-- A currency's rate per USD on a date, or (nearest = true) the nearest held: the latest on or before it, else the
-- earliest after it. As `rateFor` in packages/domain.
create function private.rate_per_usd(on_day date, code text, nearest boolean) returns numeric
language sql stable
set search_path = ''
as $$
	select coalesce(
		(select per_usd from public.exchange_rates where on_date = on_day and currency = code),
		case when nearest then coalesce(
			(select per_usd from public.exchange_rates where on_date < on_day and currency = code
				order by on_date desc limit 1),
			(select per_usd from public.exchange_rates where on_date > on_day and currency = code
				order by on_date limit 1)
		) end
	);
$$;
revoke all on function private.rate_per_usd(date, text, boolean) from public;

-- An amount converted between currencies at their rates per USD, rounded half away from zero to the target's minor
-- units: as `Money.converted` in packages/domain.
create function private.converted(amount numeric, from_per_usd numeric, to_per_usd numeric, to_currency text)
returns numeric
language sql immutable
set search_path = ''
as $$
	select round(amount * to_per_usd / from_per_usd, private.currency_decimals(to_currency));
$$;
revoke all on function private.converted(numeric, numeric, numeric, text) from public;

-- A User asking for past dates' rates, shared by the RPC and the Base amount trigger: at most 31 dates a day each,
-- serialised per User; held, future, pre-1999 and already pending dates are skipped.
create function private.ask_for_rates(asker uuid, dates date[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	allowance integer;
	added integer;
begin
	-- A Former member (an Entry made by a deleted User) asks for nothing.
	if not exists (select 1 from auth.users where id = asker) then
		return 0;
	end if;
	perform pg_advisory_xact_lock(hashtext('exchange-rate-asks'), hashtext(asker::text));
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
		and not exists (select 1 from private.exchange_rate_requests q where q.on_date = d and q.fulfilled_at is null)
	order by d desc
	limit greatest(allowance, 0)
	on conflict (on_date) do update
		set requested_by = excluded.requested_by, requested_at = now(), fulfilled_at = null
		where private.exchange_rate_requests.fulfilled_at is not null;
	get diagnostics added = row_count;
	return added;
end;
$$;
revoke all on function private.ask_for_rates(uuid, date[]) from public;

create or replace function public.ask_for_exchange_rates(dates date[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	asker uuid := (select auth.uid());
begin
	if asker is null then
		raise exception 'Only a signed-in User asks for rates' using errcode = '42501';
	end if;
	return private.ask_for_rates(asker, dates);
end;
$$;

-- Every Entry written, by anyone: a Base-currency one carries no Base amount; an edited one keeps the User's figure;
-- otherwise the market figure when the date's rates are held, else an estimate (the device's, or the nearest rates'),
-- and the date's rates are asked for on behalf of whoever wrote it.
create function private.fill_base_amount() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	wallet_currency text := (select currency from public.wallets where id = new.wallet_id);
	base_currency text := (select h.base_currency from public.households h where h.id = new.household_id);
	from_rate numeric;
	to_rate numeric;
	moved boolean := false;
begin
	-- Moved: its amount, date or Wallet changed while its Base amount didn't, so that figure is stale.
	if tg_op = 'UPDATE' then
		if (new.amount, new.occurred_on, new.wallet_id) is distinct from (old.amount, old.occurred_on, old.wallet_id)
			and new.base_amount is not distinct from old.base_amount then
			moved := true;
		end if;
	end if;
	if wallet_currency is null or base_currency is null or wallet_currency = base_currency then
		new.base_amount := null;
		new.base_rate := null;
		return new;
	end if;
	if new.base_rate = 'edited' and new.base_amount is not null then
		return new;
	end if;
	from_rate := private.rate_per_usd(new.occurred_on, wallet_currency, false);
	to_rate := private.rate_per_usd(new.occurred_on, base_currency, false);
	if from_rate is not null and to_rate is not null then
		new.base_amount := private.converted(new.amount, from_rate, to_rate, base_currency);
		new.base_rate := 'market';
		return new;
	end if;
	new.base_rate := 'estimated';
	-- A device's estimate stands, unless the Entry moved without one.
	if new.base_amount is null or moved then
		from_rate := private.rate_per_usd(new.occurred_on, wallet_currency, true);
		to_rate := private.rate_per_usd(new.occurred_on, base_currency, true);
		new.base_amount := case when from_rate is not null and to_rate is not null
			then private.converted(new.amount, from_rate, to_rate, base_currency) end;
	end if;
	perform private.ask_for_rates(coalesce((select auth.uid()), new.created_by), array[new.occurred_on]);
	return new;
end;
$$;
revoke all on function private.fill_base_amount() from public;
create trigger fill_base_amount before insert or update on public.entries
	for each row execute function private.fill_base_amount();

-- Storing a date's rates corrects that date's estimated Entries (the trigger recomputes them).
create or replace function public.store_exchange_rates(on_date date, rates jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
	insert into public.exchange_rates (on_date, currency, per_usd)
	select store_exchange_rates.on_date, r.key, r.value::numeric
	from jsonb_each_text(rates) r
	on conflict do nothing;
	update private.exchange_rate_requests q set fulfilled_at = now()
	where q.on_date = store_exchange_rates.on_date and q.fulfilled_at is null;
	update public.entries e set base_rate = e.base_rate
	where e.base_rate = 'estimated' and e.occurred_on = store_exchange_rates.on_date;
end;
$$;

-- Budget notifications count Base amounts, as the Budgets tab does (`categoryTotals`): an Entry in another currency
-- counts its Base amount (none yet: not at all), and an itemized one splits it across its Items in proportion, the
-- last Item by position taking what rounding leaves (`itemBaseShares`).
create or replace function private.budget_levels(target_household uuid, today date, start_day integer)
returns table (category_id uuid, category_name text, month text, level integer)
language sql stable security definer
set search_path = ''
as $$
	with span as (
		select private.budget_month_start(today, start_day) as first
	), bounds as (
		select first, ((first + interval '1 month')::date - 1) as last, to_char(first, 'YYYY-MM') as month from span
	), flows as (
		select e.id, e.category_id, abs(e.amount) as amount,
			case when e.base_rate is null then abs(e.amount) else abs(e.base_amount) end as base,
			private.currency_decimals(h.base_currency) as decimals
		from public.entries e, bounds b, public.households h
		where e.household_id = target_household and h.id = target_household and e.kind in ('expense', 'income')
			and e.occurred_on between b.first and b.last
			and (e.base_rate is null or e.base_amount is not null)
	), itemized as (
		select i.category_id, f.base, i.position,
			case when f.base = f.amount then i.amount else round(i.amount * f.base / f.amount, f.decimals) end as share,
			row_number() over (partition by i.entry_id order by i.position desc) = 1 as last_item,
			i.entry_id
		from public.entry_items i join flows f on f.id = i.entry_id
	), counted as (
		select it.category_id,
			case when it.last_item
				then it.base - coalesce((select sum(o.share) from itemized o where o.entry_id = it.entry_id and not o.last_item), 0)
				else it.share end as amount
		from itemized it
		union all
		select f.category_id, f.base from flows f
		where f.category_id is not null and not exists (select 1 from public.entry_items i where i.entry_id = f.id)
	), own as (
		select counted.category_id, sum(counted.amount) as amount from counted group by counted.category_id
	), budgeted as (
		select c.id, c.name, b.month,
			case
				when exists (select 1 from public.budget_overrides o where o.category_id = c.id and o.month = b.month)
					then (select o.amount from public.budget_overrides o where o.category_id = c.id and o.month = b.month
						order by o.created_at desc limit 1)
				else (select s.amount from public.budgets s where s.category_id = c.id and s.valid_from <= b.month
					order by s.valid_from desc, s.created_at desc limit 1)
			end as budget,
			coalesce((select own.amount from own where own.category_id = c.id), 0)
				+ coalesce((select sum(own.amount) from own join public.categories sub on sub.id = own.category_id
					where sub.parent_id = c.id), 0) as used
		from public.categories c, bounds b
		where c.household_id = target_household and c.kind = 'expense' and c.archived_at is null
	)
	select id, name, month, case when used >= budget then 100 else 80 end
	from budgeted
	where budget > 0 and used * 5 >= budget * 4;
$$;
