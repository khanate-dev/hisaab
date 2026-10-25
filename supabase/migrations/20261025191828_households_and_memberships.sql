-- Households are the tenant (ADR-0001). Every User gets a Personal household with an Admin Membership on sign-up.

-- Server-side helpers live outside the API-exposed schemas.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- RFC 9562 UUIDv7: a 48-bit Unix-millisecond timestamp, then random bits (Postgres 17 has no built-in).
-- Clients mint their own UUIDv7 ids; this covers the rows the server itself creates.
create function private.uuid_v7() returns uuid
language sql volatile
set search_path = ''
as $$
	select encode(
		set_bit(
			set_bit(
				overlay(
					uuid_send(gen_random_uuid())
					placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
					from 1 for 6
				),
				52, 1
			),
			53, 1
		),
		'hex'
	)::uuid;
$$;
revoke all on function private.uuid_v7() from public;

create table public.households (
	-- Ids are client-generated UUIDv7 (ADR-0001), so there is no default.
	id uuid primary key,
	name text not null check (char_length(btrim(name)) between 1 and 100),
	-- Set only on a Personal household; one per User.
	personal_user_id uuid unique references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

create table public.memberships (
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- TODO(#64): account deletion replaces the User with a Former member in shared households instead of cascading.
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('admin', 'member', 'viewer')),
	created_at timestamptz not null default now(),
	unique (household_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- Security definer, so policies on memberships can consult memberships without recursing through RLS.
create function private.is_member(target_household_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.memberships
		where household_id = target_household_id and user_id = (select auth.uid())
	);
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.memberships enable row level security;

create policy "Members read their households" on public.households
	for select to authenticated using (private.is_member(id));
create policy "Members read their households' memberships" on public.memberships
	for select to authenticated using (private.is_member(household_id));

-- Reads only for now: household and membership writes arrive with their own tickets.
revoke all on public.households, public.memberships from anon, authenticated;
grant select on public.households, public.memberships to authenticated;

create function private.create_personal_household() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
	personal_id uuid := private.uuid_v7();
begin
	insert into public.households (id, name, personal_user_id) values (personal_id, 'Personal', new.id);
	insert into public.memberships (id, household_id, user_id, role) values (private.uuid_v7(), personal_id, new.id, 'admin');
	return new;
end;
$$;
revoke all on function private.create_personal_household() from public;

create trigger create_personal_household
	after insert on auth.users
	for each row execute function private.create_personal_household();
