-- Invites (spec §3.1): an Admin's expiring, revocable link that lets one person join the household with a preset
-- Role, optionally only someone signed in with one email. The accept-invite Edge Function redeems it; nobody joins a
-- household any other way. Expand-only: a new table, a new function.

create table public.invites (
	-- Client-generated UUIDv7 (ADR-0001).
	id uuid primary key,
	household_id uuid not null references public.households (id) on delete cascade,
	-- The secret the link carries: 24 random bytes, base64url. Only the household's Admins ever read it.
	token text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
	role text not null check (role in ('admin', 'member', 'viewer')),
	-- Only someone signed in with this email may accept it; null lets anyone with the link.
	email text check (email is null or (email = lower(btrim(email)) and char_length(email) between 3 and 320)),
	expires_at timestamptz not null,
	revoked_at timestamptz,
	accepted_by uuid,
	accepted_at timestamptz,
	created_by uuid not null,
	created_at timestamptz not null default now(),
	-- Links live a day to a month.
	check (expires_at > created_at and expires_at <= created_at + interval '31 days'),
	check ((accepted_by is null) = (accepted_at is null))
);
create index invites_household_id_idx on public.invites (household_id);
alter table public.invites enable row level security;
create policy "Admins read their households' Invites" on public.invites
	for select to authenticated using (private.is_admin(household_id));
create policy "Admins create Invites" on public.invites
	for insert to authenticated
	with check (private.is_admin(household_id) and created_by = (select auth.uid()) and accepted_by is null
		and revoked_at is null);
create policy "Admins revoke Invites" on public.invites
	for update to authenticated using (private.is_admin(household_id)) with check (private.is_admin(household_id));
-- No delete: a revoked or used Invite stays, as a record of who joined how.
revoke all on public.invites from anon, authenticated;
grant select, insert, update on public.invites to authenticated;

-- From a client, an Invite only ever gets revoked, once; everything else is as created (or as accepted, which only
-- the accept-invite function's redeem_invite does).
create function private.keep_invite_origin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.id is distinct from old.id or new.household_id is distinct from old.household_id
		or new.token is distinct from old.token or new.role is distinct from old.role
		or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
		or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
		or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
		raise exception 'An Invite only gets revoked, once' using errcode = '42501';
	end if;
	-- redeem_invite runs as its owner; every client role is refused.
	if (new.accepted_by is distinct from old.accepted_by or new.accepted_at is distinct from old.accepted_at)
		and current_user <> 'postgres' then
		raise exception 'Only accepting an Invite marks it accepted' using errcode = '42501';
	end if;
	return new;
end;
$$;
revoke all on function private.keep_invite_origin() from public;
create trigger keep_invite_origin before update on public.invites
	for each row execute function private.keep_invite_origin();

-- Not in the Activity log: every Member reads it, and an Invite's token is for Admins only. Who joined is logged, as
-- the Membership redeem_invite adds.

-- Redeems an open Invite for a User, once: marks it accepted and gives them its Role in its household. Returns the
-- household, or null when the Invite is no longer open (revoked, expired or used since it was read). The caller has
-- already checked the email; this re-checks only what can change between the read and the write. Service role only.
create function public.redeem_invite(target_invite uuid, joiner uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
	invite public.invites;
begin
	update public.invites set accepted_by = joiner, accepted_at = now()
	where id = target_invite and accepted_at is null and revoked_at is null and expires_at > now()
	returning * into invite;
	if not found then
		return null;
	end if;
	insert into public.memberships (id, household_id, user_id, role)
	values (private.uuid_v7(), invite.household_id, joiner, invite.role)
	on conflict (household_id, user_id) do nothing;
	return invite.household_id;
end;
$$;
revoke all on function public.redeem_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite(uuid, uuid) to service_role;
