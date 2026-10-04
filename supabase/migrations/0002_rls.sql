-- Row-level security. The app connects as a privileged role and then does
--   set local role authenticated; set_config('request.jwt.claims', '{"sub":"<profile auth id>"}', true)
-- so every query is evaluated as the signed-in person. Pipeline/admin code uses the service role.

-- ---------------------------------------------------------------- identity helpers
create or replace function app.me() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from public.profiles where auth_user_id = auth.uid() and is_active
$$;

create or replace function app.my_role() returns text
language sql stable security definer set search_path = public, auth as $$
  select role from public.profiles where auth_user_id = auth.uid() and is_active
$$;

create or replace function app.my_desk() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select desk_id from public.profiles where auth_user_id = auth.uid() and is_active
$$;

-- Can the signed-in person see data owned by profile p?
-- self; desk head sees own desk; compliance/admin see everyone.
create or replace function app.sees_profile(p uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select p = app.me()
      or app.my_role() in ('compliance','admin')
      or (app.my_role() = 'desk_head'
          and exists (select 1 from public.profiles x where x.id = p and x.desk_id = app.my_desk()))
$$;

-- Can the signed-in person see this client? Only through coverage (their own book),
-- or via desk/compliance oversight.
create or replace function app.sees_client(c uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.coverage cv
    where cv.client_id = c and app.sees_profile(cv.profile_id)
  )
$$;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- shared reference (read-only to signed-in users)
create policy read_all on public.firm_settings  for select to authenticated using (true);
create policy read_all on public.desks          for select to authenticated using (true);
create policy read_all on public.instruments    for select to authenticated using (true);
create policy read_all on public.market_bars    for select to authenticated using (true);
create policy read_all on public.market_quotes  for select to authenticated using (true);
create policy read_all on public.pipeline_runs  for select to authenticated using (true);
create policy read_all on public.pipeline_steps for select to authenticated using (true);

-- Information barrier: restricted events are visible to compliance only.
create policy events_read on public.events for select to authenticated
  using (entitlement = 'public' or app.my_role() in ('compliance','admin'));

-- ---------------------------------------------------------------- people
create policy profiles_read on public.profiles for select to authenticated
  using (app.sees_profile(id) or role in ('desk_head','compliance') or desk_id = app.my_desk());

create policy prefs_rw on public.preferences for all to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me());

-- ---------------------------------------------------------------- client-scoped data (the book)
create policy clients_read on public.clients          for select to authenticated using (app.sees_client(id));
create policy contacts_read on public.contacts        for select to authenticated using (app.sees_client(client_id));
create policy interests_read on public.client_interests for select to authenticated using (app.sees_client(client_id));
create policy positions_read on public.positions      for select to authenticated using (app.sees_client(client_id));
create policy trades_read on public.trades            for select to authenticated using (app.sees_client(client_id));
create policy coverage_read on public.coverage        for select to authenticated using (app.sees_profile(profile_id));

create policy interactions_read on public.interactions for select to authenticated using (app.sees_client(client_id));
create policy interactions_ins on public.interactions for insert to authenticated
  with check (profile_id = app.me() and app.sees_client(client_id));

create policy followups_read on public.followups for select to authenticated using (app.sees_profile(profile_id));
create policy followups_ins on public.followups for insert to authenticated
  with check (profile_id = app.me() and app.sees_client(client_id));
create policy followups_upd on public.followups for update to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me());

-- ---------------------------------------------------------------- agent outputs (per person)
create policy signals_read on public.signals           for select to authenticated using (app.sees_profile(profile_id));
create policy briefs_read on public.briefs             for select to authenticated using (app.sees_profile(profile_id));
create policy brief_facts_read on public.brief_facts   for select to authenticated
  using (exists (select 1 from public.briefs b where b.id = brief_id and app.sees_profile(b.profile_id)));
create policy brief_sections_read on public.brief_sections for select to authenticated
  using (exists (select 1 from public.briefs b where b.id = brief_id and app.sees_profile(b.profile_id)));
create policy call_cards_read on public.call_cards     for select to authenticated using (app.sees_profile(profile_id));
create policy call_cards_upd on public.call_cards      for update to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me());
create policy genrec_read on public.generation_records for select to authenticated using (profile_id is null or app.sees_profile(profile_id));

-- ---------------------------------------------------------------- chat & audit
create policy threads_rw on public.chat_threads for all to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me());
create policy messages_rw on public.chat_messages for all to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me());

create policy audit_read on public.audit_log for select to authenticated
  using (app.my_role() in ('compliance','admin'));
create policy audit_ins on public.audit_log for insert to authenticated
  with check (actor_id = app.me());

-- ---------------------------------------------------------------- grants
-- anon gets nothing. authenticated is limited by the policies above. service_role bypasses RLS.
revoke all on all tables in schema public from anon;
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant select, insert, update on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
