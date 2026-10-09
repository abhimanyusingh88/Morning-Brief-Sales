create table public.live_deliveries(id text primary key, received_at timestamptz not null default now());
alter table live_deliveries enable row level security;
create table public.live_model_budget(day date primary key, calls int not null default 0 check(calls>=0));
alter table live_model_budget enable row level security;
create table public.live_refresh_requests(profile_id uuid primary key references profiles(id), requested_at timestamptz not null);
alter table live_refresh_requests enable row level security;
