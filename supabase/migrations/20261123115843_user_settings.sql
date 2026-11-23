-- A User's own settings (#53): for now the display currency My overview is shown in (CONTEXT.md, My overview). The
-- User's only: nobody else reads it, and it syncs to their devices alone. Expand-only: a new table.
create table public.user_settings (
	-- The User's id: one row each.
	id uuid primary key references auth.users (id) on delete cascade,
	display_currency text check (display_currency ~ '^[A-Z]{3}$'),
	created_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;
create policy "Users read their own settings" on public.user_settings
	for select to authenticated using (id = (select auth.uid()));
create policy "Users make their own settings" on public.user_settings
	for insert to authenticated with check (id = (select auth.uid()));
create policy "Users change their own settings" on public.user_settings
	for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
