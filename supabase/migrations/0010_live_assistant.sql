create table public.live_assistant_usage (
 profile_id uuid not null references profiles(id), day date not null,
 calls int not null default 0, last_call timestamptz not null default now(),
 primary key(profile_id,day)
);
alter table live_assistant_usage enable row level security;
create table public.live_assistant_messages (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id),
 report_id uuid not null references live_reports(id), question text not null, answer text not null,
 source_ids uuid[] not null default '{}', method text not null,
 created_at timestamptz not null default now()
);
alter table live_assistant_messages enable row level security;
grant select,insert on live_assistant_messages to authenticated;
create policy live_assistant_read on live_assistant_messages for select to authenticated using(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
create policy live_assistant_insert on live_assistant_messages for insert to authenticated with check(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
-- Withdraw unrelated headlines previously admitted by the broad geopolitical keyword rule.
update live_articles set status='withdrawn' where status='verified' and title ~* '\m(nobel|obituary)\M';
