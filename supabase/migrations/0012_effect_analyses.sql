create table public.live_effect_analyses (
 profile_id uuid not null references profiles(id),
 cache_key text not null,
 report_id uuid not null references live_reports(id),
 article_id uuid not null references live_articles(id),
 lease_token uuid, lease_until timestamptz,
 payload jsonb,
 retry_after timestamptz,
 updated_at timestamptz not null default now(),
 primary key(profile_id,cache_key)
);
alter table live_effect_analyses enable row level security;
grant select,insert,update on live_effect_analyses to authenticated;
create policy live_effect_read on live_effect_analyses for select to authenticated using(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
create policy live_effect_insert on live_effect_analyses for insert to authenticated with check(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
create policy live_effect_update on live_effect_analyses for update to authenticated using(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
) with check(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
