-- ADR-0009: a manual integer contract version gates writes from clients older than the server's minimum.

-- One row, synced to every User through a global Sync Stream. Raising the minimum is itself a migration.
create table public.app_config (
	id text primary key check (id = 'app'),
	min_contract_version integer not null check (min_contract_version >= 1)
);
insert into public.app_config (id, min_contract_version) values ('app', 1);

alter table public.app_config enable row level security;
create policy "Users read app_config" on public.app_config for select to authenticated using (true);
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;

-- PostgREST's db_pre_request: runs before every API request, as the request's role.
-- RAISE with SQLSTATE PT426 becomes HTTP 426. Downloads come through PowerSync, so they are never gated.
create function private.check_contract_version() returns void
language plpgsql stable
set search_path = ''
as $$
declare
	sent text := current_setting('request.headers', true)::json ->> 'x-contract-version';
	minimum integer;
begin
	-- Server-side callers (Edge Functions, seeding) use the service role; they are not app builds.
	-- current_user is this function's owner (security definer); the request's role is the SET ROLE value.
	if current_setting('role', true) = 'service_role' then
		return;
	end if;

	select min_contract_version into minimum from public.app_config where id = 'app';
	-- Fail closed: without its row the gate refuses everyone instead of letting every build through.
	if minimum is null then
		raise sqlstate 'PT503' using message = 'app_config is missing its row';
	end if;

	-- Same rule as packages/domain/src/contract-version.ts: up to nine digits, at or above the minimum.
	if sent is null or sent !~ '^[0-9]{1,9}$' then
		sent := null;
	end if;
	if sent is null or sent::integer < minimum then
		raise sqlstate 'PT426' using
			message = 'Update required',
			detail = format('This app speaks contract version %s; the server needs %s or later.', coalesce(sent, 'none'), minimum);
	end if;
end;
$$;

-- The check reads app_config past RLS, since anon and the gate itself must see the minimum.
alter function private.check_contract_version() security definer;
revoke all on function private.check_contract_version() from public;
grant usage on schema private to anon;
grant execute on function private.check_contract_version() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'private.check_contract_version';
notify pgrst, 'reload config';
