-- Brief history.
-- 1. A past day's report stays readable when one of its stories is later re-verified with new evidence. Today's
--    report keeps the exact evidence-hash check; past reports still require every story to remain verified.
drop policy if exists live_reports_read on live_reports;
create policy live_reports_read on live_reports for select to authenticated using(
 profile_id=app.me() and not exists(
  select 1 from unnest(input_client_ids) cid where not exists(select 1 from live_clients c where c.id=cid)
 ) and not exists(
  select 1 from jsonb_array_elements(payload->'articles') a
  where not exists(select 1 from live_articles e where e.id=(a->>'id')::uuid and e.status='verified'
   and (e.evidence_hash=a->>'evidenceHash' or business_date<(now() at time zone 'America/New_York')::date))
 )
);
-- 2. Public market panels (futures and holding charts, economic calendar) saved as fetched, so a day's charts can
--    be shown later and when the live source is down. Public data only: symbols, never client names or positions.
create table public.live_market_snapshots (
 business_date date not null, key text not null, payload jsonb not null, source text not null,
 fetched_at timestamptz not null default now(), primary key(business_date,key)
);
alter table live_market_snapshots enable row level security;
grant select on live_market_snapshots to authenticated;
create policy live_market_snapshots_read on live_market_snapshots for select to authenticated using(true);
