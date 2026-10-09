-- Article summaries have their own daily allowance so pipeline calls cannot exhaust them.
create table public.live_summary_budget (day date primary key, calls int not null default 0 check(calls>=0));
alter table live_summary_budget enable row level security;
