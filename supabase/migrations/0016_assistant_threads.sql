-- Separate analyst conversations. Each message belongs to one thread; history never crosses threads.
create table public.live_assistant_threads (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references profiles(id),
 title text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on live_assistant_threads(profile_id,updated_at desc);
alter table live_assistant_threads enable row level security;
grant select,insert,update,delete on live_assistant_threads to authenticated;
create policy live_assistant_threads_own on live_assistant_threads for all to authenticated using(profile_id=app.me()) with check(profile_id=app.me());

alter table live_assistant_messages add column thread_id uuid references live_assistant_threads(id) on delete cascade;
alter table live_assistant_messages add column notice text;
create index on live_assistant_messages(thread_id,created_at);
grant delete on live_assistant_messages to authenticated;
create policy live_assistant_delete on live_assistant_messages for delete to authenticated using(profile_id=app.me());
-- Thread messages stay readable after the report they were asked against is superseded.
drop policy live_assistant_read on live_assistant_messages;
create policy live_assistant_read on live_assistant_messages for select to authenticated using(profile_id=app.me());
