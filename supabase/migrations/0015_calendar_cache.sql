-- Shared cache of the public economic calendar so every process respects the provider's rate limit.
create table public.live_calendar_cache (
 cache_key text primary key,
 payload jsonb,
 fetched_at timestamptz,
 attempted_at timestamptz not null default now()
);
alter table live_calendar_cache enable row level security;
