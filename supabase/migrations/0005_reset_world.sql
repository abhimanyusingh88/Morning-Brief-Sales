-- Wipes the synthetic world so app.seed_world(date) can be run again (daily re-seed, demo reset).
-- Kept separate from the seed function on purpose: destructive statements get their own migration.
create or replace function app.reset_world() returns void
language plpgsql security definer set search_path = public, app as $$
begin
  truncate public.clients, public.events, public.market_bars, public.market_quotes, public.briefs,
           public.pipeline_runs, public.chat_threads, public.audit_log, public.signals cascade;
end;
$$;

revoke all on function app.reset_world() from public, anon, authenticated;
grant execute on function app.reset_world() to service_role;
