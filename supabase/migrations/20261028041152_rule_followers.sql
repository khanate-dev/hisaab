-- Following a Recurring rule (issue #9's table; #105): its maker always hears when an Occurrence is due or was
-- Auto-recorded; any other Admin or Member can turn on "Notify me" for it too. One row per rule and User, under an id
-- derived from the two (`ruleFollowerId`), so two devices choosing offline write the same row; turned off, not
-- deleted, for the same reason. Expand-only: a new table, and the facts the 09:00 job reads widened.

create table public.recurring_rule_followers (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	rule_id uuid not null,
	user_id uuid not null references auth.users (id) on delete cascade,
	enabled boolean not null,
	created_at timestamptz not null default now(),
	unique (rule_id, user_id),
	-- A rule deleted takes who followed it with it.
	foreign key (rule_id, household_id) references public.recurring_rules (id, household_id) on delete cascade
);
create index recurring_rule_followers_household_id_idx on public.recurring_rule_followers (household_id);
create index recurring_rule_followers_user_id_idx on public.recurring_rule_followers (user_id);
alter table public.recurring_rule_followers enable row level security;
create policy "Users see what they follow" on public.recurring_rule_followers
	for select to authenticated using (user_id = (select auth.uid()) and private.is_member(household_id));
-- Viewers get no Recurring notifications by default and can't follow a rule (issue #9).
create policy "Admins and Members follow rules" on public.recurring_rule_followers
	for insert to authenticated with check (user_id = (select auth.uid()) and private.can_write(household_id));
create policy "Admins and Members change what they follow" on public.recurring_rule_followers
	for update to authenticated
	using (user_id = (select auth.uid()) and private.can_write(household_id))
	with check (user_id = (select auth.uid()) and private.can_write(household_id));
revoke all on public.recurring_rule_followers from anon, authenticated;
grant select, insert, update on public.recurring_rule_followers to authenticated;

-- Its id is the one every device derives (`ruleFollowerId`), and it stays its User's, for its rule; another device's
-- copy keeps when it was first made.
create function private.keep_rule_follower_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from extensions.uuid_generate_v5('8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13',
		format('follow/%s/%s', new.rule_id, new.user_id)) then
		raise exception 'A follow''s id comes from its rule and User' using errcode = '23514';
	end if;
	if tg_op = 'UPDATE' then
		new.created_at := old.created_at;
	end if;
	return new;
end;
$$;
revoke all on function private.keep_rule_follower_origin() from public;
create trigger keep_rule_follower_origin before insert or update on public.recurring_rule_followers
	for each row execute function private.keep_rule_follower_origin();

-- The facts the 09:00 job reads: each Occurrence now with who follows its rule.
create or replace function public.notification_facts(as_of timestamptz) returns jsonb
language sql stable security definer
set search_path = ''
as $$
	with here as (
		select h.id, h.name, h.budget_month_start_day as start_day, (as_of at time zone h.timezone)::date as today
		from public.households h
		where h.timezone is not null and extract(hour from (as_of at time zone h.timezone)) >= 9
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'householdId', here.id,
		'householdName', here.name,
		'today', to_char(here.today, 'YYYY-MM-DD'),
		'members', (
			select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role)), '[]'::jsonb)
			from public.memberships m where m.household_id = here.id
		),
		'occurrences', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'ruleId', r.id,
				'mode', r.mode,
				'createdBy', r.created_by,
				-- Free text, which may hold a figure: for the inbox only, never push.
				'ruleName', coalesce(nullif(btrim(r.description), ''), c.name),
				'categoryName', c.name,
				'dueOn', to_char(due.due_on, 'YYYY-MM-DD'),
				'state', case
					when o.id is null or (o.state = 'snoozed' and o.snoozed_until <= here.today) then 'pending'
					else o.state
				end,
				'snoozedUntil', to_char(o.snoozed_until, 'YYYY-MM-DD'),
				-- Who else asked to hear about it: Admins and Members still, who turned "Notify me" on.
				'followers', (
					select coalesce(jsonb_agg(fl.user_id), '[]'::jsonb) from public.recurring_rule_followers fl
					where fl.rule_id = r.id and fl.enabled and exists (select 1 from public.memberships m
						where m.household_id = r.household_id and m.user_id = fl.user_id and m.role in ('admin', 'member'))
				)
			)), '[]'::jsonb)
			from (
				select r.id as rule_id, d.due_on
				from public.recurring_rules r
				cross join lateral private.schedule_dates(r.frequency, r.interval, r.day_of_month, r.starts_on, r.ends_on,
					greatest(r.starts_on, (r.created_at at time zone 'UTC')::date, here.today - 3), here.today) as d(due_on)
				where r.household_id = here.id
				union
				select s.rule_id, s.due_on from public.occurrences s
				where s.household_id = here.id and s.state = 'snoozed' and s.snoozed_until = here.today
			) as due
			join public.recurring_rules r on r.id = due.rule_id
			join public.categories c on c.id = r.category_id and c.household_id = r.household_id
			left join public.occurrences o on o.rule_id = r.id and o.due_on = due.due_on
		),
		'loans', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'loanId', l.id,
				'contactName', ct.name,
				'direction', l.direction,
				'dueOn', to_char(l.due_on, 'YYYY-MM-DD')
			)), '[]'::jsonb)
			from public.loans l
			join public.contacts ct on ct.id = l.contact_id and ct.household_id = l.household_id
			where l.household_id = here.id and l.written_off_at is null and l.due_on is not null
				and l.due_on <= here.today + 3
				-- Still owed (`loanOutstanding`): Lent comes back, Borrowed goes back.
				and (select case when l.direction = 'lent' then -coalesce(sum(e.amount), 0) else coalesce(sum(e.amount), 0) end
					from public.entries e where e.loan_id = l.id) > 0
		),
		'budgets', (
			select coalesce(jsonb_agg(jsonb_build_object(
				'categoryId', b.category_id,
				'categoryName', b.category_name,
				'month', b.month,
				'level', b.level
			)), '[]'::jsonb)
			from (
				select * from private.budget_levels(here.id, here.today, here.start_day)
				union all
				select * from private.budget_levels(here.id, here.today - 1, here.start_day)
				where private.budget_month_start(here.today, here.start_day) = here.today
			) as b
		)
	)), '[]'::jsonb)
	from here;
$$;
